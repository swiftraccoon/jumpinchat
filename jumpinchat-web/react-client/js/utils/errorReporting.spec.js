import { describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/browser';
import { initErrorReporting } from './errorReporting';

vi.mock('@sentry/browser', () => ({ init: vi.fn() }));

describe('error reporting privacy', () => {
  it.each(['development', 'test', undefined])('does not initialize in %s', (environment) => {
    initErrorReporting({ dsn: 'https://public@example.test/1', environment });
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('does not initialize without a configured DSN', () => {
    initErrorReporting({ environment: 'production' });
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('preserves the v10 privacy baseline when initializing Sentry 11', () => {
    initErrorReporting({ dsn: 'https://public@example.test/1', environment: 'production', release: 'test-build' });
    expect(Sentry.init).toHaveBeenCalledExactlyOnceWith({
      dsn: 'https://public@example.test/1',
      environment: 'production',
      release: 'test-build',
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: {
          request: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
          response: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
        },
        httpBodies: [],
        urlQueryParams: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
        genAI: { inputs: false, outputs: false },
        databaseQueryData: false,
        queues: false,
        graphQL: { document: false, variables: false },
      },
    });
  });
});
