import Busboy from 'busboy';
import logFactory from '../../../utils/logger.util.js';
import { getUserById } from '../user.utils.js';
import config from '../../../config/env/index.js';
import errors from '../../../config/constants/errors.js';
const log = logFactory({ name: 'uploadDisplayImage' });
import {
  convertImages,
  mergeBuffers,
  s3Upload,
  isValidImage,
  getExtFromMime,
  validateMagicBytes,
} from '../../../utils/utils.js';


export default function uploadDisplayImage(req, res) {
  log.debug('uploadDisplayImage');
  let busboy;
  let hasErr = false;
  try {
    busboy = Busboy({
      headers: req.headers,
      limits: {
        fileSize: config.uploads.userProfileAvatar.size,
        files: 1,
      },
    });
  } catch (e) {
    log.error('error happened');
    return res.status(415).send();
  }

  if (String(req.user._id) !== req.params.userId) {
    log.warn('User ID and ident cookie do not match');
    return res.status(401).send();
  }

  busboy.on('file', (fieldname, file, { filename: fileName, encoding, mimeType }) => {
    log.debug('Processing file');

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

      const fileBuffer = mergeBuffers(dataArr);
      if (!validateMagicBytes(fileBuffer, mimeType)) {
        log.error({ mimeType }, 'magic bytes do not match claimed MIME type');
        return res.status(400).send(errors.ERR_FILE_TYPE);
      }

      const dimensions = {
        width: config.uploads.userProfileAvatar.width,
        height: config.uploads.userProfileAvatar.height,
      };

      convertImages(fileBuffer, dimensions, (err, convertedImage) => {
        if (err) {
          return res.status(500).send();
        }

        getUserById(req.params.userId, (err, user) => {
          if (err) {
            log.fatal('error fetching user', { err });
            return res.status(500).send();
          }

          const filePath = `user-avatar/avatar-${user.username}.${getExtFromMime(mimeType)}`;

          log.debug('uploading image to s3');

          s3Upload(convertedImage, filePath, (err, data) => {
            if (err) {
              log.fatal('upload to s3 failed', { err });
              return res.status(500).send();
            }

            log.info(`upload done: ${filePath}`);

            user.profile.pic = filePath;

            user.save()
              .then(() => res.status(200).send({ url: filePath }))
              .catch((saveErr) => {
                log.fatal('saving user failed', { err: saveErr });
                res.status(500).send();
              });
          });
        });
      });
    });
  });

  req.pipe(busboy);
};
