// Pedidos à internet. No telemóvel o Capacitor (CapacitorHttp ativado em
// capacitor.config.json) faz os pedidos pelo Android nativo, por isso os sites
// não bloqueiam por CORS.
const TIMEOUT_MS = 20000;

function withTimeout(promise, ms = TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Tempo esgotado')), ms)),
  ]);
}

async function get(url, headers = {}) {
  const res = await withTimeout(fetch(url, { headers }));
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res;
}

export async function getJson(url, headers = {}) {
  const res = await get(url, { Accept: 'application/json', ...headers });
  const body = await withTimeout(res.text());
  return typeof body === 'string' ? JSON.parse(body) : body;
}

export async function getText(url, headers = {}) {
  const res = await get(url, headers);
  return withTimeout(res.text());
}
