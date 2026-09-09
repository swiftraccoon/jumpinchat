# Test and build commands

Use Node 22 (the container/CI major) and npm. The committed package-lock files
are authoritative; the historical web Yarn lock is retained without modification
and is not used by scripts or image builds.

```bash
npm --prefix jumpinchat-web ci --legacy-peer-deps
npm --prefix jumpinchat-homepage ci --legacy-peer-deps
./scripts/test.sh
npm --prefix jumpinchat-web run lint:critical
./scripts/build.sh
npm --prefix jumpinchat-homepage run build
python3 scripts/generate-compose.py --check
python3 -m unittest discover -s scripts -p 'test_*.py'
```

The root test command runs the server suite with its esmock loader, focused client
callback/recovery tests, and homepage tests. Arguments passed to it select server
tests; the client and homepage suites still run in full. To select homepage or
client cases, invoke their package commands directly.

## Coverage still to migrate

The 46 historical `react-client/**/*.spec.js` files use Jest/Enzyme and are **not
executed** by `test:client`. That command explicitly runs `test/client/**/*.spec.js`
using Mocha, Babel, Sinon, and a controlled Janus dependency boundary. It tests the
real media module without requiring the React 17 adapter for a React 18 app.

Inventory the historical files with:

```bash
git ls-files 'jumpinchat-web/react-client/**/*.spec.js'
```

Migrate media-device selection, camera rendering, and chat interaction tests next,
then remove the obsolete adapter after all its consumers have been replaced.
Existing snapshot presence does not establish passing coverage.

Three server cases remain explicitly pending:

- `srv/api/room/tests/controllers/room.privateMessage.spec.js`: socket ID cache
  misses for a guest recipient and a registered recipient (two cases).
- `srv/api/room/tests/controllers/room.join.spec.js`: creating a new Janus room.

These are unchanged historical `xit` cases, not verified behavior. Implement
dependency fixtures and assertions before enabling them.

`./scripts/lint.sh` checks the full historical codebase. CI reports its existing
backlog without blocking. `lint:critical` blocks undefined-variable errors in the
changed media and server lifecycle modules. Expand that blocking scope as the
backlog is repaired; do not interpret it as a full style-lint pass.

## Runtime verification

Unit tests and asset builds do not validate the container network, media gateway,
or data recovery. Before deployment, build all images and verify cold startup,
readiness during database/Redis loss, termination and reconnect, and a two-browser
call including permission denial and a temporary network interruption. Follow
[RECOVERY.md](RECOVERY.md) for a restore exercise on an isolated host.
