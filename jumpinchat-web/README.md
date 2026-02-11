# JumpInChat Web Server and Client

API server and React client for JumpInChat video chat rooms.

## Contents
1. [Requirements](#requirements)
1. [Installation](#installation)
1. [Development](#development)
1. [Building](#building)
1. [Testing](#testing)
1. [Architecture](#architecture)

## Requirements

- Node.js >= 22.0.0
- MongoDB (replica set)
- Redis

## Installation

```bash
npm install --legacy-peer-deps
```

Copy `example.env` to `.env` and fill in the required values.

## Development

### Running locally

The easiest way to run the full stack is via podman-compose from the
[deploy repo](../jumpinchat-deploy):

```bash
cd ../jumpinchat-deploy
podman-compose up -d
```

To run just the web server for development:

1. Start MongoDB (replica set) and Redis
2. Start a Janus WebRTC gateway instance
3. Run the dev server:

```bash
npx nodemon | npx bunyan
```

Local environment variables are set in `nodemon.json`.

### Client development

The client is a React 18 application under [./react-client](./react-client),
bundled with webpack.

Watch mode (auto-rebuild on changes):

```bash
./node_modules/.bin/gulp watchify
```

## Building

Production build (compiles JS, SCSS, revisions assets, generates service worker):

```bash
./node_modules/.bin/gulp build
```

## Testing

Server tests (mocha):

```bash
npm test
```

Tests use ESM via esmock for module mocking.

## Architecture

- **Server**: Express 5, ESM modules, Mongoose 9, Socket.io 4
- **Client**: React 18, Flux, webpack 5
- **Auth**: Cookie-based sessions + JWT tokens
- **Media**: Janus WebRTC gateway (VP8/VP9)
- **Icons**: Font Awesome 7 (free, npm packages)
