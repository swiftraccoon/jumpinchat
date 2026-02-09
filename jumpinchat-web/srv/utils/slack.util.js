const axios = require('axios');
const log = require('./logger.util')({ name: 'SlackBot' });

class SlackBot {
  constructor(url, username, icon, channel = '#general') {
    this.url = url;
    this.username = username;
    this.channel = channel;
    this.icon = icon;
  }

  message(attachments) {
    const payload = {
      username: this.username,
      channel: this.channel,
      icon_url: this.icon,
      attachments,
    };

    return axios.post(this.url, payload)
      .then(() => {})
      .catch((err) => {
        const status = err.response && err.response.status;
        log.fatal({ err, statusCode: status }, 'error posting slack webhook');
        throw status || err;
      });
  }
}

module.exports = SlackBot;
