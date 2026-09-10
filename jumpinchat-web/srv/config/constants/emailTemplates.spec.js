import { expect } from 'chai';
import esmock from 'esmock';

describe('account email links', () => {
  it('uses the configured origin for verification, room and account links', async () => {
    const templates = await esmock('./emailTemplates.js', {
      '../publicUrl.js': { getPublicBaseUrl: () => 'https://localhost:8443' },
    });
    const html = templates.signUpTemplate({ username: 'fixture', token: 'verification-token' });
    expect(html).to.include('href="https://localhost:8443/verify-email/verification-token"');
    expect(html).to.include('href="https://localhost:8443/fixture"');
    expect(html).to.include('href="https://localhost:8443/settings/profile"');
    expect(html).not.to.include('https://jumpin.chat');
  });

  it('keeps password resets on the configured deployment', async () => {
    const templates = await esmock('./emailTemplates.js', {
      '../publicUrl.js': { getPublicBaseUrl: () => 'https://staging.example.org' },
    });
    const html = templates.resetPasswordTemplate({ username: 'fixture', token: 'reset-token' });
    expect(html).to.include('href="https://staging.example.org/password-reset/reset/reset-token"');
    expect(html).not.to.include('https://jumpin.chat');
  });
});
