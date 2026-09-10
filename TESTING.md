# Test and build commands

Use Node 24.11+ LTS (24.x) or Node 26, and npm. The committed npm lockfiles are
authoritative. Install without legacy peer overrides.

```bash
npm --prefix jumpinchat-web ci
npm --prefix jumpinchat-homepage ci
npm --prefix jumpinchat-email ci
./scripts/test.sh
./scripts/lint.sh
./scripts/build.sh
npm --prefix jumpinchat-homepage run build
python3 scripts/generate-compose.py --check
python3 -m unittest discover -s scripts -p 'test_*.py'
```

The root test command runs server Mocha/esmock tests, frontend Vitest/React Testing
Library tests, the controlled Mocha media callback suite, homepage tests, and email HTTP/SMTP tests.
Arguments to the root script select server tests; other suites still run in full.

```bash
# All browser components, stores, and utilities, plus the media callback suite:
npm --prefix jumpinchat-web run test:client
# Select React tests without invoking Mocha:
cd jumpinchat-web
npx vitest run --config vitest.config.js RoomChatInput
# Run only the controlled Janus/media recovery boundary:
npm run test:media
```

Vitest uses jsdom and transforms historical JSX-in-`.js` modules with esbuild.
Its include pattern is `react-client/**/*.spec.js`; Mocha explicitly selects
`test/client/**/*.spec.js`. Neither runner collects the other's tests. The media
harness compiles the real CamUtil module to CommonJS with esbuild before executing
it against controlled Janus/browser callbacks; it does not load a React adapter.

After the utility replacement and transport recovery fixes, all 58 Vitest files
passed (170 tests), alongside 505 server, 120 homepage, 13 email and 21 media tests.
The media cases preserve denial/unreadable/unknown camera failures, retry bounds,
cancellation, and stale session callback behavior.

## Historical frontend inventory

All 46 previously unexecuted historical specs are now executed by Vitest. All 36
Enzyme component files now render with React Testing Library. The 10 store/utility
files exercise their public state transitions and outputs. No historical spec is
excluded or left pending. Old shallow-render snapshots, private-instance calls,
`shouldComponentUpdate` implementation checks, and repeated setter assertions
were retired in favor of the concrete behavior below; old snapshots were deleted.
This is a behavior migration, not a claim that every old assertion was preserved.

Paths below are relative to `jumpinchat-web/react-client/js/`.

| Historical spec | Replacement coverage |
| --- | --- |
| `components/elements/VideoVolumeControl.spec.js` | Mute/unmute, numeric native slider, keyboard focus |
| `components/room/BanlistModal/BanlistModal.spec.js` | Active versus expired bans, unban selection, empty state |
| `components/room/MediaSelectionModal.spec.js` | Device-step selection, single publish transition, Escape, forced PTT |
| `components/room/MediaSource.spec.js` | Acquire/attach preview, track cleanup, late acquisition, permission errors |
| `components/room/ProfileModal/Info.spec.js` | Guest/account identity text |
| `components/room/ProfileModal/Options.spec.js` | Private conversation, ignore/unignore, moderation permissions |
| `components/room/ReportModal/ReportModal.spec.js` | Required reason, report payload, cancellation |
| `components/room/RoomCamOptions.spec.js` | Room permissions and hide/resume controls; per-camera hide/restore and permissions |
| `components/room/cams/RoomBroadcastButton.spec.js` | Permission probe cleanup, device deduplication, denied start, stop cooldown, capacity |
| `components/room/cams/RoomCam.spec.js` | Stream attachment, delayed dimensions, mute/volume updates, detector cleanup, fullscreen/report |
| `components/room/cams/RoomCamAudioActions.spec.js` | Per-feed volume, mute transitions, local-stream exclusion |
| `components/room/cams/RoomCamOptions.spec.js` | Room permissions and hide/resume controls; per-camera hide/restore and permissions |
| `components/room/cams/RoomCams.spec.js` | Native measurement on resize, shared-video preference |
| `components/room/cams/RoomCamsHeader.spec.js` | Room description, broadcast restriction, microphone availability |
| `components/room/cams/RoomCamsLocalAudioActions.spec.js` | PTT press/release timing, continuous microphone toggle |
| `components/room/chat/RoomChat.spec.js` | Public/private navigation, expansion toggle |
| `components/room/chat/RoomChatFeed.spec.js` | Follow/pause/resume scrolling and first message |
| `components/room/chat/RoomChatHeader.spec.js` | Public/private tabs, unread count, participant-list toggle |
| `components/room/chat/RoomChatInput.spec.js` | Submit/trim/clear, guest guard, name completion, stale async search, emoji selection, listener cleanup |
| `components/room/chat/RoomChatMessage.spec.js` | Safe links, sender mention action, mention highlight, badges, literal status text |
| `components/room/chat/RoomChatSettingsMenu.spec.js` | Notification subscription/persistence and account theme |
| `components/room/chat/RoomChatShare.spec.js` | Native room URL sharing and confirmation |
| `components/room/chat/RoomUserIcon.spec.js` | Guest/account/supporter/admin identity |
| `components/room/chat/RoomUserList.spec.js` | Admin priority and unknown-role fallback |
| `components/room/chat/RoomUserListItem.spec.js` | Profile selection and self handle editing |
| `components/room/chat/RoomUserListItemIcon.spec.js` | Default-role omission and assigned badge |
| `components/room/chat/privateMessages/PmConversationList.spec.js` | Selected conversation highlight |
| `components/room/chat/privateMessages/PmFeed.spec.js` | Selected content, disabled replies, native PM scrolling |
| `components/room/chat/privateMessages/PmListItem.spec.js` | Unread count and selection |
| `components/room/chat/privateMessages/PmListItemOptions.spec.js` | Portal action, Escape focus return, inside/outside pointer dismissal |
| `components/room/chat/privateMessages/PmWrapper.spec.js` | Recipient send/clear, read on focus, empty submit/list |
| `components/room/youtube/YoutubeModal.spec.js` | Playlist removal, search-result transition, Escape |
| `components/room/youtube/YoutubeSearchModal.spec.js` | Query threshold, clear, playback selection, visible failure |
| `components/room/youtube/YoutubeVideoContainer.spec.js` | Player ready/seek/pause/volume, timer cleanup, end/error callbacks |
| `components/room/youtube/YoutubeVideoOptions.spec.js` | Sync/hide and keyboard dismissal |
| `components/settings/RoomUsers/RoomUsers.spec.js` | Enrollment load, role/search filters, newly added participant visibility |
| `stores/CamStore/CamStore.spec.js` | Remote hide/resume/disconnect, local preservation, receive quality |
| `stores/ChatStore/ChatStore.spec.js` | Bounded messages/history, ignored/unread messages, sound rejection, handle cache, scroll threshold |
| `stores/ModalStore.spec.js` | Input-device separation, camera/microphone selection, error reset |
| `stores/NotifiationStore.spec.js` | Expiry, persistent notices, deduplication, pause/resume |
| `stores/PmStore/PmStore.spec.js` | Unread/read state, ignored senders, account reconnect, conversation removal |
| `stores/UserStore.spec.js` | Guest restoration, account precedence, preference persistence |
| `stores/YoutubeStore.spec.js` | Search/playback separation and volume retention |
| `utils/chatUtils.spec.js` | Mention matching and escaped handles |
| `utils/localStorage.spec.js` | JSON round trip and fallback |
| `utils/pack.spec.js` | Empty/single/multi-camera layout outputs |

Additional specs cover Tooltip focus/description/Escape, real Emoji Mart 5 data
and shortcode adaptation, nested dispatcher FIFO ordering/error recovery, and
Zustand subscription cleanup/publication. The in-house replacements for removed
packages have their own specs: `react-client/js/utils/{classNames,lang,uuid,audioLevel}.spec.js`
(class joining, debounce with `maxWait`, path setting, RegExp escaping, UUID
fallbacks, analyser-based volume/speaking events), `RoomChatShare.spec.js`
(async clipboard success and failure), server `srv/utils/{id,ip,date,duration,object,string}.util.spec.js`
(client-IP precedence, zoned calendar dates, ISO 8601 durations incl. the
invalid `P1S` case, deep merge/pick/omit/groupBy semantics), and homepage
`utils/{objects,pagination,ip}.spec.js` plus `src/js/settingsScripts.spec.js`
(the former jQuery page scripts against JSDOM with a stubbed `fetch`: username
availability, form-encoded DELETE requests, verification rate limiting, modals,
one-shot buttons). Regression cases additionally cover forwarded IPv4 addresses
with ports, preserved IPv6 addresses, elapsed time across both daylight-saving
transitions (including the repeated hour), and copying the complete HTTPS room
URL through the legacy clipboard fallback. Network APIs and provider callbacks are
mocked at explicit boundaries; native DOM controls, focus, portals, scroll events,
React rendering, and ordinary store state transitions execute for real.

Development servers use portable `node --watch`; a disposable Linux Node 24.20.0
container check verified `.env` loading and restarts when an imported module
changes. The platform-specific `--watch-path` option is not required.

`RoomUtils.spec.js` covers initial versus recovered connections, repeated
disconnects, migration requests still in flight when another connection arrives,
failed migration and connection errors. Server recovery tests cover the 60-second
transport grace period, atomic membership migration/removal, session ownership,
cache expiry, private-message routing, and delayed Janus cleanup. Deliberate
namespace disconnects still leave immediately. Lost sessions trigger a full page
reload so chat and media are initialized with consistent identities.
`SocketUtil.spec.js` checks the application event queue across initial connection,
repeated outages, reentrant sends and a disconnect during draining. Outgoing
events resume after an outage only once the recovered room mapping is confirmed;
the transport's connect event alone cannot flush them. Successful recovery clears obsolete connection
warnings while preserving unrelated notices. `test/client/remoteFeeds.spec.js`
exercises the real CamUtil module through controlled Janus callbacks: duplicate
pending/active announcements during renegotiation, transient versus failed ICE,
hangup/resume, attachment and negotiation failures, unpublish, track cleanup and
callbacks from departed sessions. A client session keeps at most one pending or active subscriber handle per
publisher; late callbacks cannot replace or remove its current subscription.

## Remaining limits

The three formerly pending server cases now execute: private-message cache misses
for guests and registered users, and reusing the existing Janus room during join
(room creation owns Janus room allocation). The server suite has no pending cases.

Most frontend tests use jsdom. A separate final deployment check used Chromium
153.0.8010.12 with real application, Socket.IO, Janus 1.4.1 and coturn 4.18
processes. Five isolated browser sessions passed 39 checks: room creation/join,
two-way chat, advancing decoded video and received audio energy, TURN relay on
every active publisher/subscriber connection, Janus reclaim, Socket.IO recovery,
permission denial/regrant, and capture-track cleanup. A chat message submitted
while disconnected arrived exactly once after recovery under the original room
user ID, without a missing-session error or stale connection-failure notice.
A separate two-browser run passed 20 checks after physically disconnecting and
restoring the disposable browser container's network: received media stopped,
then fresh audio/video and both chat directions resumed. Each browser retained
exactly one active publisher and one subscriber connection, with no duplicate
receiver or reopened nickname dialog.

These browser runs use a synthetic camera pattern and microphone tone on one
isolated container network. They do not establish physical-device compatibility,
other-browser behavior, production NAT/firewall traversal, or recovery from every
outage duration. Public ICE servers and unrelated external requests are excluded.
Real network paths and supported devices/browsers still need a deployment check.

The final disposable lite stack rebuilt web, home, email, nginx, Janus and coturn
from the repository Dockerfiles with unique image tags, fresh MongoDB/Redis
volumes, test secrets and a dedicated certificate. Seven application checks
passed through nginx HTTPS with certificate validation: page rendering,
registration and room creation, shared authenticated sessions, local SMTP
verification, persisted avatar/room-cover upload and image readback, and
logout/returning login. The original deployment's stopped containers and volumes
were kept separate from these fixtures. Stopping MongoDB made web and homepage
readiness return 503; stopping Redis made web readiness return 503 while homepage
readiness stayed 200. Liveness stayed 200 throughout, and readiness recovered
after each same-container restart without replacing data volumes. After validation,
all 11 test containers, six owned volumes, the isolated network and ten test image
tags were removed. The original eight container identities and five original
volume identities matched the recorded baseline; build caches were preserved.

The email suite also uses real Nodemailer 10 against a disposable loopback SMTP
peer. It verifies envelope/MIME delivery, waiting for final DATA acceptance, and
HTTP 502 responses for recipient or DATA rejection. Provider TLS/authentication
and actual inbox delivery still require the configured SMTP service. Stripe
network responses remain doubles; live provider webhooks and historical payment
reconciliation require the operator's test environment and records.

The native restore rehearsal uses synthetic MongoDB 8.3 data and uploads. It does
not replace rehearsing the actual backup through the supported MongoDB major
upgrade sequence, feature compatibility changes, and production indexes/topology.
Follow [RECOVERY.md](RECOVERY.md) for that isolated exercise before cutover.

## Maintained browser libraries

`ModalCompatibility.spec.js` exercises React Modal with React 19: background
accessibility state, Escape, focus restoration, and an open portal's unmount.
`SortableCompatibility.spec.js` uses the real React DnD HTML5 backend for drag
midpoint/reorder behavior and listener teardown followed by remount.

The homepage `src/js/browserMigrations.spec.js` covers Cropper 2 API boundaries,
256×256 avatar and 320×240 room-image export, image replacement races, single
submission, failures and retry, date-fns calendar wording, and versioned
Fingerprint 5 registration. Cropper's image decoding/canvas export is doubled;
the separate Chrome 152 migration check rendered the real upload Pug mixin and
Cropper 2.2 source, decoded an image, and exported both crop dimensions with opaque
pixels. It verified valid image panning and prevented drag/zoom from exposing
empty pixels outside the image. This check used a local fixture page and no
upload/provider service; broader device and browser coverage remains manual.


## Runtime and production artifact checks

`scripts/test-runtime.mjs` uses explicit MongoDB/Redis binary paths, random
loopback ports and fresh temporary databases. It verifies real account login,
Mongo/Redis sessions and TTL, EJS/Pug rendering, two-process chat and rate limits.
It also severs a real Socket.IO transport and recovers the same room member onto
the other application process, then checks bidirectional chat, private messages,
Redis cache migration/expiry and a repeated recovery request.
It also runs 18 payment integration cases against real MongoDB with automatic
index creation disabled: concurrent deliveries and gifts, failure recovery,
lease fencing, cancellation ordering, billing periods, private replay markers and
the legacy reconciliation procedure. Strict mocks replace provider boundaries
without initializing their original Redis clients. The subprocess receives only
the fixture's MongoDB/Redis endpoints and must exit without Mocha's `--exit` flag.
Stripe responses in this suite are provider doubles; no charges are made.
Supplying Database Tools paths also rehearses synthetic database and local-upload
restoration. See [RECOVERY.md](RECOVERY.md#synthetic-runtime-and-restore-rehearsal)
for invocation and its boundary from production data and Compose orchestration.

`scripts/test-deployment.mjs` checks an already-running disposable lite stack over
loopback HTTPS. It creates synthetic accounts and rooms, verifies shared login
sessions, follows a locally captured verification email, uploads an avatar and
room cover, decodes their nginx-served images, and checks logout/returning login.
It trusts only the supplied test CA and uses the supplied HTTP host name.

```bash
node scripts/test-deployment.mjs \
  --origin https://127.0.0.1:8443 --host local.jumpin.chat \
  --smtp http://127.0.0.1:8081/messages --ca /path/to/test/fullchain.pem \
  --report /path/to/artifacts/application.json
```

Provision the stack with fresh volumes, secrets, certificate and unique image
tags. Point its mail service at a local SMTP capture peer, and provide a local MX
record for `example.com`, the reserved recipient domain used by the script.
The capture endpoint must return accepted messages as a JSON array containing
`to` (an array of envelope recipients) and `mime` (the raw MIME text). No external
SMTP provider is needed. Teardown belongs to the stack owner: the script leaves
its synthetic accounts and uploads in that disposable stack for inspection.

`scripts/test-media.mjs` drives the built room UI against the same disposable
stack. Supply Playwright and its full Chromium installation from a separate test
directory; the runner adds no application dependency. Default headless-shell
Chromium is insufficient for these native media checks. The browser must resolve
and reach the stack's HTTPS, Janus and TURN endpoints. `TLS_SPKI` optionally trusts
only the dedicated test certificate's public key; omit it for an already-trusted
certificate. List any additional isolated HTTP/ICE hosts explicitly.

```bash
PLAYWRIGHT_PACKAGE=/path/to/browser-tools/node_modules/playwright \
BASE_URL=https://local.jumpin.chat \
EXTRA_HOSTS=turn.local.jumpin.chat \
TLS_SPKI="$TEST_CERT_SPKI" \
OUTPUT_DIR=/path/to/artifacts/media PHASE=all \
node scripts/test-media.mjs
```

`PHASE=all` includes normal media, chat/signaling recovery, denied permissions and
forced TURN relay; `direct`, `relay` and `permissions` select individual groups.
The runner writes JSON diagnostics, native WebRTC statistics and screenshots.
It creates disposable guest rooms; the stack owner handles fixture teardown.

`PHASE=network` requires a separate host controller and a fresh shared
`NETWORK_CONTROL_DIR`. The runner creates that directory and writes `ready.json`
after media and chat are active. The controller disconnects only the disposable
browser container, then writes `disconnected.json`. Once the runner has measured
stopped inbound media, it writes `resume-requested.json`; the controller restores
the same network/IP and writes `reconnected.json`. Each marker must contain a JSON
object. The runner checks fresh media progress and both chat directions before
writing `complete.json`. The controller must restore connectivity in a `finally`
block and impose its own short maximum outage even if the runner fails; the final
validation used a 25-second safeguard. Never target the working deployment's
network or containers.

After a production web build, run `node scripts/check-web-build.mjs`. The checker
verifies referenced assets, source maps, fonts, media and the service-worker
manifest; `npm run dev` uses unversioned development assets with no precache.

CI runs clean installs, validates peers and audits dependencies, then runs all
application tests, blocking lint, production builds, Compose generation and
operational tests. `./scripts/lint.sh` reports correctness errors; running ESLint
without `--quiet` also shows the historical unused-variable and cleanup warnings.

## Stripe migration validation

The server payment suite has 54 passing cases, including locally generated real
Stripe SDK signatures, SetupIntent account/customer/confirmation checks, hosted
URL responses, paid/delayed/gift/annual fulfillment and retry handling. The
homepage has 22 focused payment route/browser cases. All Stripe and notification
network calls are doubled; no real payment or external account was changed.

The shared runtime harness also runs
`jumpinchat-web/test/payment/fulfillment.mongo.spec.js`: 18 cases against disposable
MongoDB 8.3 databases for actual atomic date pipelines, same/different checkout
concurrency, post-grant failure recovery, expiring/fenced leases, unique index
creation/enforcement with autoIndex disabled, marker privacy, paid invoice periods,
cancellation races, and four legacy checkout reconciliation scenarios. See the
[payment migration runbook](jumpinchat-web/srv/api/payment/MIGRATION.md)
for standalone invocation, required historical checkout reconciliation and the
subscription/gift duration behavior change before production cutover.
