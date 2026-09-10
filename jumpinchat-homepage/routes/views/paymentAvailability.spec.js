import { expect } from 'chai';
import pug from 'pug';
import { fileURLToPath } from 'node:url';

const render = Object.fromEntries(['profile', 'support', 'room/settings/emoji'].map(name => [
  name,
  pug.compileFile(fileURLToPath(new URL(`../../templates/views/${name}.pug`, import.meta.url))),
]));

describe('payment availability in rendered views', () => {
  const user = { _id: 'viewer', username: 'viewer', attrs: {} };
  const recipient = { _id: 'recipient', username: 'recipient', attrs: {}, profile: {} };
  const common = { navLinks: [], asset: value => value, user };
  const profile = { ...common, username: recipient.username, profileUser: recipient, trophies: [] };
  const room = {
    ...common, room: { name: 'recipient' }, roomOwner: recipient,
    userIsMod: true, roomGold: false, emoji: [],
  };

  it('keeps profile messaging available while hiding disabled gift checkout', () => {
    const html = render.profile({ ...profile, supportEnabled: false });
    expect(html).to.include('href="/messages/recipient"');
    expect(html).not.to.include('/support/payment');
    expect(html).not.to.include('Gift Support');
  });

  it('keeps profile gift checkout available when payments are enabled', () => {
    const html = render.profile({ ...profile, supportEnabled: true });
    expect(html).to.include('/support/payment?productId=onetime&amp;amount=300&amp;beneficiary=recipient');
    expect(html).to.include('Gift Support');
  });

  it('does not offer a moderator gift checkout when payments are disabled', () => {
    const html = render['room/settings/emoji']({ ...room, supportEnabled: false });
    expect(html).to.include('Room emoji');
    expect(html).not.to.include('/support/payment');
    expect(html).not.to.include('Gift Support');
  });

  it('keeps room-owner gift checkout available to moderators when payments are enabled', () => {
    const html = render['room/settings/emoji']({ ...room, supportEnabled: true });
    expect(html).to.include('/support/payment?productId=onetime&amp;amount=300&amp;beneficiary=recipient');
    expect(html).to.include('Gift Support');
  });

  it('does not offer a disabled supporter purchase to the room owner', () => {
    const html = render['room/settings/emoji']({ ...room, user: recipient, supportEnabled: false });
    expect(html).not.to.include('Become a Supporter');
    expect(html).to.include('Supporter payments are not set up on this instance');
  });

  it('explains disabled payments without checkout links or loading Stripe', () => {
    const html = render.support({ ...common, supportEnabled: false });
    expect(html).to.include('Supporter payments are not set up on this instance');
    expect(html).to.include('Back to the homepage');
    expect(html).not.to.include('/support/payment');
    expect(html).not.to.include('js.stripe.com');
  });
});
