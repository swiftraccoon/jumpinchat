const posts = [
  {
    slug: 'modernization-update',
    title: 'Modernization Update',
    date: '2026-02-15T00:00:00Z',
    summary: 'JumpInChat updated after sitting dormant for several years.',
    content: `
JumpInChat hadn't been touched in a while. The codebase was showing its
age — outdated dependencies, deprecated APIs, security issues piling up. This
update brings everything current.

## What changed

The entire stack was modernized:

- Node.js 22, Express 5, Mongoose 9
- All server code converted from CommonJS to ESM
- Dependencies updated across the board (200+ packages)
- Security hardening: helmet, hardened cookies, input validation
- AWS services replaced with local filesystem storage and generic SMTP
- Vendored libraries replaced with npm packages
- Test coverage expanded significantly

The homepage was rewritten from Keystone.js to plain Express, and the WebRTC
integration was migrated to the current Janus Gateway track-based API.

The site may or may not be publicly hosted — either way, the code is in better
shape than it's been in years.
    `.trim(),
  },
];

export default posts;
