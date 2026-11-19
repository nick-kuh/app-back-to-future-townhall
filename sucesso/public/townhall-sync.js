/* Same-origin requests and a single live refresh loop per screen. */
(() => {
  async function request(path, { method = 'GET', body, signal = AbortSignal.timeout(10000) } = {}) {
    const response = await fetch(path, {
      method, signal, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (!response.ok || data === null) {
      const error = new Error(data?.error || 'Não foi possível sincronizar com o servidor.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function poll(load, onData, onError, interval = 1200) {
    let timer, active, failures = 0, stopped = false;
    function cancel() {
      clearTimeout(timer);
      active?.abort();
      active = null;
    }
    async function refresh() {
      cancel();
      if (stopped || document.hidden) return;
      const controller = new AbortController();
      active = controller;
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const data = await load(controller.signal);
        if (active !== controller) return;
        onData(data);
        failures = 0;
      } catch (error) {
        if (active !== controller) return;
        failures++;
        onError(error);
      } finally {
        clearTimeout(timeout);
        if (active === controller) {
          active = null;
          const delay = Math.min(15000, interval * 2 ** Math.min(failures, 4));
          timer = setTimeout(refresh, delay + Math.random() * 200);
        }
      }
    }
    function visibility() {
      if (document.hidden) cancel();
      else refresh();
    }
    function stop() {
      stopped = true;
      cancel();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('online', refresh);
    }
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('online', refresh);
    refresh();
    return { refresh, stop };
  }

  window.TownhallSync = { request, poll };
})();
