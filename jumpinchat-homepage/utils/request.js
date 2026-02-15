import axios from 'axios';

export default async function request(opts) {
  const config = {
    method: opts.method || 'GET',
    url: opts.uri || opts.url,
    headers: opts.headers || {},
  };

  if (opts.body) config.data = opts.body;
  if (opts.formData) {
    config.data = opts.formData;
    config.headers['Content-Type'] = 'multipart/form-data';
  }

  const response = await axios(config);
  return response.data;
}
