import * as Sentry from '@sentry/browser';

export function initErrorReporting({ dsn, environment, release }) {
  if (environment !== 'production' || !dsn) return;
  // Sentry 11 collects more data by default. Preserve the v10 privacy baseline
  // explicitly instead of enabling request bodies, cookies or inferred user PII.
  const sensitiveHeaders = ['forwarded', '-ip', 'remote-', 'via', '-user'];
  Sentry.init({
    dsn,
    environment,
    release,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { deny: [...sensitiveHeaders] },
        response: { deny: [...sensitiveHeaders] },
      },
      httpBodies: [],
      urlQueryParams: { deny: [...sensitiveHeaders] },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
    },
  });
}
