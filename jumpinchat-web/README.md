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

- Node 24 LTS (`nvm use`)
- MongoDB 8.3 (replica set; migrate existing data before upgrading)
- Redis

## Installation

```bash
npm ci
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

1. Start MongoDB 8.3 (replica set; migrate existing data before upgrading) and Redis
2. Start a Janus WebRTC gateway instance
3. Run the dev server:

```bash
npm run dev:server
```

Set local environment variables in `.env`; Node loads them before importing the
server and restarts it when the entry point or imported modules change
(`node --watch`, supported on Linux, macOS and Windows).

### Client development

The client is a React 19 application under [./react-client](./react-client),
bundled with webpack.

Watch mode (auto-rebuild on changes):

```bash
npm run dev
```

## Building

Production build (compiles JS, SCSS, revisions assets, generates service worker):

```bash
npm run build
```

## Testing

Server tests (mocha):

```bash
npm test
```

Tests use ESM via esmock for module mocking. Run `npm run test:client` for the
React Testing Library suite and media callback regressions. See
[TESTING.md](../TESTING.md) for the shared command, CI checks, and the complete
historical-spec migration inventory.

## Architecture

- **Server**: Express 5, ESM modules, Mongoose 9, Socket.io 4
- **Client**: React 19, Zustand, webpack 5
- **Auth**: Cookie-based sessions + JWT tokens
- **Media**: Janus WebRTC gateway (VP8/VP9)
- **Icons**: Font Awesome 7 (free, npm packages)

Logs use Pino JSON. GitHub Actions runs the shared checks; obsolete Jenkins
Node 10/Yarn jobs and Python 2/boto artifact publishers have been retired.
Container builds are the supported deployment path; npm locks are authoritative.
