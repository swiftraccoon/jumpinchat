// Own one recovery operation at a time. Invalidating a generation makes late
// Janus callbacks harmless after a retry, successful recovery, or room exit.
export default function createMediaRecovery({ onStart, onFailure, delay = 2000,
  timeout = 10000, maxAttempts = 5 }) {
  let generation = 0;
  let active = false;
  let retryTimer;
  let attemptTimer;

  function cancel() {
    generation += 1;
    active = false;
    clearTimeout(retryTimer);
    clearTimeout(attemptTimer);
  }

  function start(operation, onSuccess) {
    if (active) return;
    active = true;
    onStart();
    let attempts = 0;

    function schedule() {
      const current = ++generation;
      retryTimer = setTimeout(() => {
        if (!active || current !== generation) return;
        attempts += 1;
        let settled = false;
        const finish = (succeeded, value) => {
          if (settled || !active || current !== generation) return;
          settled = true;
          clearTimeout(attemptTimer);
          if (succeeded) {
            cancel();
            onSuccess(value);
          } else if (attempts >= maxAttempts) {
            cancel();
            onFailure();
          } else {
            schedule();
          }
        };
        attemptTimer = setTimeout(() => finish(false), timeout);
        try {
          operation(value => finish(true, value), () => finish(false));
        } catch (err) {
          finish(false);
        }
      }, delay);
    }

    schedule();
  }

  return { start, cancel };
}
