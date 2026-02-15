import url from 'url';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import Joi from 'joi';
import { marked } from 'marked';
import logFactory from '../../../utils/logger.js';
import config from '../../../config/index.js';
import { getUserByUsername } from '../../../utils/userUtils.js';
import { getConversation, markMessagesRead } from '../../../utils/messageUtils.js';
import {
  errors,
  successMessages,
  api,
  messageReportReasons,
} from '../../../constants/constants.js';

const log = logFactory({ name: 'messages.compose' });

export default async function messageCompose(req, res) {
  const { locals } = res;
  const { recipient } = req.params;
  const {
    success,
    error,
    page = 1,
    report,
  } = req.query;

  // locals.section is used to set the currently selected
  // item in the header navigation.
  locals.section = 'Messages | Inbox';
  locals.user = req.user;
  locals.error = error || null;
  locals.success = success || null;
  locals.recipient = null;
  locals.userIgnored = false;
  locals.page = page;
  locals.messageReportReasons = messageReportReasons;
  locals.report = report;

  // Init phase
  if (!locals.user) {
    return res.redirect('/');
  }

  const token = jwt.sign(String(req.user._id), config.auth.jwtSecret);

  const cache = locals.success ? 0 : 1;

  try {
    const user = await getUserByUsername(recipient);
    if (!user) {
      log.warn('no user found');
      return res.redirect('/messages');
    }

    const conversation = await getConversation(String(req.user._id), user.id, token, page, cache);
    await markMessagesRead(String(req.user._id), user.id, token);

    locals.recipient = user;
    locals.conversation = {
      ...conversation,
      messages: conversation.messages.map(m => ({
        ...m,
        message: m.message && marked(m.message),
      })),
    };

    locals.userIgnored = locals.user.settings.ignoreList
      .some(u => String(u.userId) === String(locals.recipient._id));
  } catch (err) {
    log.fatal({ err }, 'failed to get recipient user');
    return res.status(500).end();
  }

  // POST: send
  if (req.method === 'POST' && req.body.action === 'send') {
    const schema = Joi.object({
      message: Joi.string().required(),
    });

    const { error: validationError, value } = schema.validate({
      message: req.body.message,
    });

    if (validationError) {
      locals.error = errors.ERR_VALIDATION;
      return res.redirect(url.format({
        path: './',
        query: {
          error: locals.error,
        },
      }));
    }

    try {
      const response = await axios({
        url: `${api}/api/message/${locals.recipient._id}`,
        method: 'POST',
        headers: {
          Authorization: token,
        },
        data: {
          message: value.message,
        },
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        log.error({ body: response.data });
        if (response.data && response.data.message) {
          locals.error = response.data.message;
        } else {
          locals.error = errors.ERR_SRV;
        }
        return res.redirect(url.format({
          path: './',
          query: {
            error: locals.error,
          },
        }));
      }

      locals.success = 'Message sent';

      return res.redirect(url.format({
        path: './',
        query: {
          success: locals.success,
        },
      }));
    } catch (err) {
      log.error({ err }, 'error retrieving conversations');
      locals.error = errors.ERR_SRV;
      return res.redirect(url.format({
        path: './',
        query: {
          error: locals.error,
        },
      }));
    }
  }

  // POST: ignore
  if (req.method === 'POST' && req.body.action === 'ignore') {
    if (locals.userIgnored) {
      locals.user.settings.ignoreList = locals.user.settings.ignoreList
        .filter(u => String(u.userId) !== String(locals.recipient._id));
    } else {
      locals.user.settings.ignoreList = [
        ...locals.user.settings.ignoreList,
        {
          handle: locals.recipient.username,
          timestamp: Date.now(),
          userId: locals.recipient._id,
        },
      ];
    }

    try {
      const savedUser = await locals.user.save();
      locals.user = savedUser;
      locals.success = 'User settings saved';
      return res.redirect(url.format({
        path: './',
        query: {
          success: locals.success,
        },
      }));
    } catch (err) {
      log.fatal({ err }, 'error saving room');
      return res.status(500).send();
    }
  }

  // POST: report
  if (req.method === 'POST' && req.body.action === 'report') {
    const schema = Joi.object({
      reason: Joi.string().required(),
      message: Joi.string().required(),
    });

    const { error: validationError, value } = schema.validate({
      reason: req.body.reason,
      message: report,
    });

    if (validationError) {
      locals.error = errors.ERR_VALIDATION;
      return res.redirect(url.format({
        path: './',
        query: {
          error: locals.error,
        },
      }));
    }

    try {
      const response = await axios({
        url: `${api}/api/report/message`,
        method: 'POST',
        headers: {
          Authorization: token,
        },
        data: {
          messageId: value.message,
          reason: value.reason,
        },
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        log.error({ body: response.data });
        if (response.data && response.data.message) {
          locals.error = response.data.message;
        } else {
          locals.error = errors.ERR_SRV;
        }
        return res.redirect(url.format({
          path: './',
          query: {
            error: locals.error,
          },
        }));
      }

      locals.success = 'Report sent';
      return res.redirect(url.format({
        path: './',
        query: {
          success: locals.success,
        },
      }));
    } catch (err) {
      log.error({ err }, 'error posting report');
      locals.error = errors.ERR_SRV;
      return res.redirect(url.format({
        path: './',
        query: {
          error: locals.error,
        },
      }));
    }
  }

  // POST: archive
  if (req.method === 'POST' && req.body.action === 'archive') {
    try {
      const response = await axios({
        url: `${api}/api/message/archive/${locals.user._id}/${locals.conversation.participant._id}`,
        method: 'PUT',
        headers: {
          Authorization: token,
        },
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        log.error({ body: response.data }, 'error archiving conversation');
        if (response.data && response.data.message) {
          locals.error = response.data.message;
        } else {
          locals.error = errors.ERR_SRV;
        }
        return res.redirect(url.format({
          path: './',
          query: {
            error: locals.error,
          },
        }));
      }

      log.info('conversation archived');
      locals.success = 'Conversation archived';

      return res.redirect(`/messages?success=${locals.success}`);
    } catch (err) {
      log.error({ err }, 'error archiving conversation');
      locals.error = errors.ERR_SRV;
      return res.redirect(url.format({
        path: './',
        query: {
          error: locals.error,
        },
      }));
    }
  }

  return res.render('messages/compose');
}
