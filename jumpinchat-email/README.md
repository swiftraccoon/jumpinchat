# Mail service

Use Node 24 LTS (`nvm use`), then `npm ci`. Set `SHARED_SECRET` and the
`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`
settings in `.env`; `npm start` loads that file when present. Production startup
requires `SHARED_SECRET`. TLS is enabled with `SMTP_SECURE=true` (normally port
465); other SMTP ports can negotiate STARTTLS with the provider.

`POST /email/send` requires the shared secret in the `Authorization` header and
JSON containing `to`, `subject`, and `text` or `html`. Optional fields are `from`
and `replyTo`. A 200 response means the SMTP transport accepted the message;
transport failure returns 502. This does not guarantee final inbox delivery.
Requests are no longer acknowledged before an in-memory queue attempts delivery.

`GET /status` checks HTTP liveness. Logs use Pino JSON and respect `LOG_LEVEL`.
SIGINT and SIGTERM drain active HTTP requests, with a ten-second shutdown limit.

Run `npm test` and `npm run lint`. Tests exercise HTTP authentication, validation,
SMTP acceptance and rejection, and Nodemailer's memory transport without sending
mail to an external server.
