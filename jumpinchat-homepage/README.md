# JumpInChat Homepage

Express 5 application serving the public homepage, user registration/login,
room directory, user account settings, messaging, and admin functions.

## Requirements

- Node 24 LTS (`nvm use`)
- MongoDB 8.3 (replica set; migrate existing data before upgrading)
- [jumpinchat-web](../jumpinchat-web) API server running

## Installation

```bash
npm ci
```

## Development

### Running locally

The easiest way is via podman-compose from the deploy repo:

```bash
cd ../jumpinchat-deploy
podman-compose up -d home home2
```

To run standalone:

1. Start MongoDB replica set and the API server
2. Run the dev server:

```bash
npm run dev
```

Set local environment variables in `.env`; `npm start` and `npm run dev` load
them before importing the application.

### Building assets

The Docker build compiles SCSS and bundles JS automatically:

- **SCSS**: `src/styles/site.scss` compiled with `sass`
- **JS**: `src/js/app.js` bundled with esbuild (ESM output)
- **Images**: copied from `src/images/`

### Testing

```bash
npm test
```

Tests use ESM via esmock for module mocking. Covers route handlers, login/MFA, payments, Markdown/sitemaps, middleware,
and Cropper, dates, fingerprints and card setup in jsdom.

### Compiling CSS manually

```bash
npx sass src/styles/site.scss src/styles/site.css
```

Use `npm run build` for the complete hashed asset build. Logs use Pino JSON.
Legacy Node 10/Yarn workflows and boto artifact publishing have been retired;
use the root GitHub Actions checks and container deployment.
