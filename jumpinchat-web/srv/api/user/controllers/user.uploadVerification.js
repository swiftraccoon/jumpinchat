import Busboy from 'busboy';
import { formatDistance } from 'date-fns';
import logFactory from '../../../utils/logger.util.js';
import { getUserById } from '../user.utils.js';
import AgeVerificationModel from '../../ageVerification/ageVerification.model.js';
import errors from '../../../config/constants/errors.js';
import config from '../../../config/env/index.js';
import email from '../../../config/email.config.js';
const log = logFactory({ name: 'uploadDisplayImage' });
import { getRequestsByUser, findRecentDeniedRequests } from '../../ageVerification/ageVerification.utils.js';
import { noSubmitReasons } from '../../ageVerification/ageVerification.const.js';
import { mergeBuffers, s3UploadVerification, isValidImage } from '../../../utils/utils.js';
import { ageVerifyTemplate } from '../../../config/constants/emailTemplates.js';

async function checkCanSubmitRequest(userId) {
  let activeRequests;

  try {
    activeRequests = await getRequestsByUser(userId);
    log.debug({ activeRequests }, 'currently active verification requests');
  } catch (err) {
    log.fatal({ err, userId }, 'failed to get age verification requests');
    throw err;
  }

  if (activeRequests.length > 0) {
    const expiresAt = new Date(activeRequests[0].expiresAt).getTime();
    const timeRemaining = expiresAt - Date.now();

    return {
      canSubmit: false,
      timeRemaining,
      reason: noSubmitReasons.ACTIVE,
    };
  }

  try {
    const recentDenials = await findRecentDeniedRequests(userId);

    log.debug({ recentDenials }, 'recent denials');

    if (recentDenials && recentDenials.length > 0) {
      log.debug('denied too recently');
      const updatedAt = new Date(recentDenials[0].updatedAt).getTime();
      const timeRemaining = (updatedAt + config.ageVerification.deniedTimeout) - Date.now();
      return {
        canSubmit: false,
        timeRemaining,
        reason: noSubmitReasons.DENIED,
      };
    }

    return {
      canSubmit: true,
    };
  } catch (err) {
    log.fatal({ err }, 'error fetching recent denied requests');
    return {
      canSubmit: false,
    };
  }
}

export default async function uploadVerificationImages(req, res) {
  let busboy;
  let hasErr = false;
  let canSubmit;
  let timeRemaining;
  let reason;

  const { userId } = req.params;
  const processedImages = [];
  try {
    busboy = Busboy({
      headers: req.headers,
      limits: {
        files: 2,
      },
    });
  } catch (e) {
    log.error({ err: e }, 'error happened');
    return res.status(415).send();
  }

  try {
    ({ canSubmit, timeRemaining, reason } = await checkCanSubmitRequest(userId));

    log.debug({ canSubmit, timeRemaining });
  } catch (err) {
    return res.status(500).send(errors.ERR_SRV);
  }

  if (!canSubmit && timeRemaining) {
    const timeRemainingFormatted = formatDistance(0, timeRemaining, { includeSeconds: true });

    switch (reason) {
      case noSubmitReasons.DENIED:
        return res.status(403).send({
          message: `
            Attempted request too soon after being denied.\n
            You can try again in ${timeRemainingFormatted}.
          `,
        });
      default:
        return res.status(403).send({
          message: `
            Attempted request again too soon after submitting.\n
            You can try again in ${timeRemainingFormatted}.
          `,
        });
    }
  }

  return getUserById(userId, (err, user) => {
    if (err) {
      log.fatal('error fetching user', { err });
      return res.status(500).send();
    }

    if (!user) {
      log.error('user missing');
      return res.status(401);
    }

    log.debug({ headers: req.headers }, 'watching for files');

    busboy.on('file', (fieldname, file, { filename: fileName, encoding, mimeType }) => {
      log.debug({ fieldname, fileName }, 'Processing file');

      if (!isValidImage(mimeType)) {
        log.error({ mimeType }, 'invalid file type');
        return res.status(400).send(errors.ERR_FILE_TYPE);
      }

      const dataArr = [];

      file.on('data', (data) => {
        dataArr.push({ data, length: data.byteLength });
      });

      file.on('limit', () => {
        hasErr = true;
        log.error('File has hit limit');
        return res.status(400).send(errors.ERR_FILE_LIMIT);
      });

      file.on('end', () => {
        log.debug('file end');

        if (hasErr) {
          return;
        }

        const convertedImage = mergeBuffers(dataArr);

        processedImages.push({
          imageData: convertedImage,
          fileName,
        });

        log.debug('uploading image to s3');
      });
    });

    busboy.on('finish', async () => {
      log.debug('finished');
      if (hasErr) {
        if (hasErr.code) {
          return res.status(500).send(hasErr);
        }

        return res.status(500).send();
      }

      let uploadedImages;
      try {
        uploadedImages = await Promise.all(
          processedImages.map(({ imageData, fileName }) =>
            new Promise((resolve, reject) => {
              s3UploadVerification(imageData, fileName, (err, result) => {
                if (err) return reject(err);
                return resolve(result);
              });
            })),
        );
      } catch (err) {
        log.fatal({ err }, 'error uploading images');
        return res.status(500).send();
      }

      log.debug({ uploadedImages }, 'verification images uploaded');
      try {
        const verification = await AgeVerificationModel.create({
          user: user._id,
          images: uploadedImages,
          expiresAt: Date.now() + (config.ageVerification.timeout * 1000),
        });

        email.sendMail({
          to: 'contact@example.com',
          subject: `Age verification request: ${String(verification._id)}`,
          html: ageVerifyTemplate({
            userId: verification.user,
            verificationId: verification._id,
          }),
        }, (err, info) => {
          if (err) {
            log.fatal({ err }, 'failed to send verification email');
            return;
          }

          log.info({ verificationId: verification._id }, 'verification email sent');
        });

        return res.status(200).send({ verification });
      } catch (err) {
        log.fatal({ err }, 'failed to create verification doc');
      }
    });

    busboy.on('partsLimit', () => {
      log.debug('partsLimit');
    });

    busboy.on('filesLimit', () => {
      log.debug('filesLimit');
    });

    busboy.on('fieldsLimit', () => {
      log.debug('filesLimit');
    });

    req.pipe(busboy);
  });
};
