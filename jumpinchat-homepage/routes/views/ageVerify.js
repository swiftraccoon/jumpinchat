import fs from 'fs';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import FormData from 'form-data';
import logFactory from '../../utils/logger.js';
import config from '../../config/index.js';
import { api } from '../../constants/constants.js';

const log = logFactory({ name: 'views.ageVerify' });

export default async function ageVerify(req, res) {
  const { locals } = res;

  // locals.section is used to set the currently selected
  // item in the header navigation.
  locals.page = req.params.page;
  locals.section = 'Age verification';
  locals.user = req.user;
  locals.error = null;
  locals.success = null;

  // Init phase
  if (!locals.user) {
    return res.redirect('/');
  }

  if (locals.user.attrs.ageVerified) {
    return res.redirect('/');
  }

  const token = jwt.sign(String(req.user._id), config.auth.jwtSecret);

  // POST handling
  if (req.method === 'POST' && req.body.action === 'upload') {
    if (!locals.user.auth.email_is_verified) {
      locals.error = 'Email not verified';
      return res.render('ageVerify');
    }

    const uploadUrl = `${api}/api/user/${locals.user._id}/age-verify/upload`;

    // Handle both multer array style and legacy keyed style
    let idFile;
    let selfieFile;
    if (Array.isArray(req.files)) {
      idFile = req.files.find(f => f.fieldname === 'id');
      selfieFile = req.files.find(f => f.fieldname === 'selfie');
    } else if (req.files) {
      idFile = req.files.id;
      selfieFile = req.files.selfie;
    }

    if (!idFile || !selfieFile) {
      locals.error = 'Please choose files to upload';
      return res.render('ageVerify');
    }

    const formData = new FormData();
    const tempPaths = [];

    if (idFile.buffer) {
      formData.append('id', idFile.buffer, {
        filename: idFile.originalname,
        contentType: idFile.mimetype,
      });
    } else {
      formData.append('id', fs.createReadStream(idFile.path), {
        filename: idFile.name,
        contentType: idFile.mimetype,
      });
      tempPaths.push(idFile.path);
    }

    if (selfieFile.buffer) {
      formData.append('selfie', selfieFile.buffer, {
        filename: selfieFile.originalname,
        contentType: selfieFile.mimetype,
      });
    } else {
      formData.append('selfie', fs.createReadStream(selfieFile.path), {
        filename: selfieFile.name,
        contentType: selfieFile.mimetype,
      });
      tempPaths.push(selfieFile.path);
    }

    log.debug({ formData: Object.keys(formData) });

    try {
      const response = await axios({
        url: uploadUrl,
        method: 'POST',
        headers: {
          ...formData.getHeaders(),
          Authorization: token,
        },
        data: formData,
        validateStatus: () => true,
      });

      // Clean up temp files
      for (const filepath of tempPaths) {
        fs.unlink(filepath, (err) => {
          if (err) {
            log.fatal({ err, filepath }, 'failed to remove temp file');
            return;
          }
          log.debug({ filepath }, 'removed temp file');
        });
      }

      if (response.status >= 400) {
        log.warn({ body: response.data, status: response.status }, 'failed to upload verification images');
        if (response.data && response.data.message) {
          locals.error = response.data.message;
          return res.render('ageVerify');
        }

        locals.error = 'Failed to upload';
        return res.render('ageVerify');
      }

      locals.success = 'Uploaded successfully';
      return res.redirect('/ageverify/success');
    } catch (err) {
      // Clean up temp files on error
      for (const filepath of tempPaths) {
        fs.unlink(filepath, () => {});
      }
      log.error({ err }, 'error uploading files');
      return res.status(500).send();
    }
  }

  return res.render('ageVerify');
}
