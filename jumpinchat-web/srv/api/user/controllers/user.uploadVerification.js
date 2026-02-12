import Busboy from 'busboy';
import { formatDistance } from 'date-fns';
import * as uuid from 'uuid';
import logFactory from '../../../utils/logger.util.js';
import { getUserById } from '../user.utils.js';
import AgeVerificationModel from '../../ageVerification/ageVerification.model.js';
import errors from '../../../config/constants/errors.js';
import config from '../../../config/env/index.js';
import email from '../../../config/email.config.js';
const log = logFactory({ name: 'uploadDisplayImage' });
import { getRequestsByUser, findRecentDeniedRequests } from '../../ageVerification/ageVerification.utils.js';
import { noSubmitReasons } from '../../ageVerification/ageVerification.const.js';
import { Jimp } from 'jimp';
import { mergeBuffers, s3UploadVerification, isValidImage, getExtFromMime, validateMagicBytes } from '../../../utils/utils.js';
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

    // Track async file processing to avoid race between file.on('end') and busboy.on('finish')
    const fileProcessingPromises = [];

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

      // Wrap async processing in a promise so busboy.on('finish') can await it
      const processing = new Promise((resolve) => {
        file.on('end', async () => {
          log.debug('file end');

          if (hasErr) {
            return resolve();
          }

          const rawBuffer = mergeBuffers(dataArr);

          if (!validateMagicBytes(rawBuffer, mimeType)) {
            log.error({ mimeType }, 'magic bytes do not match claimed MIME type');
            hasErr = true;
            if (!res.headersSent) res.status(400).send(errors.ERR_FILE_TYPE);
            return resolve();
          }

          // Re-encode through Jimp to strip EXIF/metadata and sanitize
          let convertedImage;
          try {
            const image = await Jimp.read(rawBuffer);
            convertedImage = await image.getBuffer(image.mime, { quality: 80 });
          } catch (err) {
            log.error({ err }, 'failed to re-encode verification image');
            hasErr = true;
            if (!res.headersSent) res.status(400).send(errors.ERR_FILE_TYPE);
            return resolve();
          }

          // Use server-generated filename instead of client-provided one
          const safeFileName = `${uuid.v4()}.${getExtFromMime(mimeType)}`;

          processedImages.push({
            imageData: convertedImage,
            fileName: safeFileName,
          });

          log.debug('image processed for upload');
          return resolve();
        });
      });

      fileProcessingPromises.push(processing);
    });

    busboy.on('finish', async () => {
      log.debug('finished');

      // Wait for all async file processing to complete before proceeding
      await Promise.all(fileProcessingPromises);

      if (hasErr) {
        if (!res.headersSent) res.status(500).send();
        return;
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
        if (!res.headersSent) return res.status(500).send();
        return;
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
        if (!res.headersSent) return res.status(500).send();
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
