# JumpInChat Homepage

Express 5 application serving the public homepage, user registration/login,
room directory, user account settings, messaging, and admin functions.

## Requirements

- Node.js >= 22.0.0
- MongoDB (replica set)
- [jumpinchat-web](../jumpinchat-web) API server running

## Installation

```bash
npm install --legacy-peer-deps
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
npx nodemon | npx bunyan
```

Local environment variables are set in `nodemon.json`.

### Building assets

The Docker build compiles SCSS and bundles JS automatically:

- **SCSS**: `src/styles/site.scss` compiled with `sass`
- **JS**: `src/js/app.js` bundled with esbuild (IIFE + ESM outputs)
- **Images**: copied from `src/images/`

### Testing

```bash
npm test
```

Tests use ESM via esmock for module mocking. Covers route handlers
(register, login, MFA) and middleware.

### Compiling CSS manually

```bash
npx sass src/styles/site.scss src/styles/site.css \
  --load-path=node_modules/normalize-scss
```
