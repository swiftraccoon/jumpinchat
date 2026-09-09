export async function withDeadline(operation, timeoutMs = 1000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Dependency check timed out')), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function registerHealthRoutes(app, { isReady, check, timeoutMs = 1000 }) {
  app.get(['/health', '/health/live'], (req, res) => res.status(200).send('ok'));
  app.get('/health/ready', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      if (!isReady()) return res.status(503).send('not ready');
      await withDeadline(check, timeoutMs);
      return res.status(isReady() ? 200 : 503).send(isReady() ? 'ready' : 'not ready');
    } catch (err) {
      return res.status(503).send('not ready');
    }
  });
}

export async function waitUntilReady(isReady, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (!isReady()) {
    if (Date.now() >= deadline) throw new Error('Startup dependencies did not become ready');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}
