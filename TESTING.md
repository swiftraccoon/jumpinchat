# Test and build commands

Use Node 24.11+ LTS (24.x) or Node 26, and npm. The committed npm lockfiles are
authoritative. Install without legacy peer overrides.

```bash
npm --prefix jumpinchat-web ci
npm --prefix jumpinchat-homepage ci
npm --prefix jumpinchat-email ci
./scripts/test.sh
npm --prefix jumpinchat-web run lint:critical
./scripts/build.sh
npm --prefix jumpinchat-homepage run build
python3 scripts/generate-compose.py --check
python3 -m unittest discover -s scripts -p 'test_*.py'
```

The root test command runs server Mocha/esmock tests, frontend Vitest/React Testing
Library tests, the controlled Mocha media callback suite, and homepage tests.
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

At migration validation, all 50 Vitest files passed (125 tests), and all 9 media
callback/recovery cases passed. The latter preserve denial/unreadable/unknown
camera failures, retry bounds, cancellation, and stale session callback behavior.

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
Zustand subscription cleanup/publication. Network APIs and provider callbacks are
mocked at explicit boundaries; native DOM controls, focus, portals, scroll events,
React rendering, and ordinary store state transitions execute for real.

## Remaining limits

Three server cases remain explicitly pending:

- `srv/api/room/tests/controllers/room.privateMessage.spec.js`: socket ID cache
  misses for a guest recipient and a registered recipient (two cases).
- `srv/api/room/tests/controllers/room.join.spec.js`: creating a new Janus room.

These are existing `xit` cases, not verified behavior. Frontend tests use jsdom;
they do not exercise browser layout, actual camera permissions, remote Janus
transport, Stripe, or real email delivery. External-provider doubles establish
local application contracts, not live integration compatibility.

Before deployment, build all images and verify cold startup, readiness during
database/Redis loss, termination and reconnect, and a two-browser call including
permission denial and a temporary network interruption. Check actual keyboard
focus, floating-menu positioning, scrolling, cropping, and media playback in a
browser. Follow [RECOVERY.md](RECOVERY.md) for a restore exercise on an isolated
host.

## Maintained browser libraries

`ModalCompatibility.spec.js` exercises React Modal with React 19: background
accessibility state, Escape, focus restoration, and an open portal's unmount.
`SortableCompatibility.spec.js` uses the real React DnD HTML5 backend for drag
midpoint/reorder behavior and listener teardown followed by remount.

The homepage `src/js/browserMigrations.spec.js` covers Cropper 2 API boundaries,
256×256 avatar and 320×240 room-image export, image replacement races, single
submission, failures and retry, date-fns calendar wording, and versioned
Fingerprint 5 registration. Cropper's image decoding/canvas export is doubled;
actual image layout and crop geometry still require browser verification.
