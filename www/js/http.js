// Pedidos à internet.
// No telemóvel usamos diretamente o HTTP nativo do Android (plugin CapacitorHttp),
// sem passar pelo WebView: assim os sites não bloqueiam por CORS e os erros
// chegam com uma mensagem clara. No navegador (testes) usamos o fetch normal.
const TIMEOUT_MS = 20000;

function withTimeout(promise, ms = TIMEOUT_MS) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, reject) => { t = setTimeout(() => reject(new Error('tempo esgotado')), ms); }),
  ]).finally(() => clearTimeout(t));
}

function nativeBridge() {
  const cap = globalThis.Capacitor;
  if (!cap || typeof cap.nativePromise !== 'function') return null;
  const native = typeof cap.isNativePlatform === 'function' ? cap.isNativePlatform() : cap.getPlatform?.() !== 'web';
  return native ? cap : null;
}

// Alguns servidores recusam pedidos sem "User-Agent" de navegador.
export const BROWSER_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

async function nativeGet(cap, url, headers) {
  const res = await withTimeout(cap.nativePromise('CapacitorHttp', 'request', {
    url,
    method: 'GET',
    headers: { 'User-Agent': BROWSER_UA, ...headers },
    connectTimeout: TIMEOUT_MS,
    readTimeout: TIMEOUT_MS,
  }), TIMEOUT_MS + 2000);
  if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
  return res.data; // string, ou objeto se a resposta for JSON
}

async function webGet(url, headers) {
  const res = await withTimeout(fetch(url, { headers }));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return withTimeout(res.text());
}

async function get(url, headers) {
  const cap = nativeBridge();
  if (cap) {
    try {
      return await nativeGet(cap, url, headers);
    } catch (e) {
      // Erro do servidor (HTTP 4xx/5xx): não adianta tentar outra via.
      if (/^HTTP \d/.test(e.message)) throw e;
      console.warn('HTTP nativo falhou, a tentar pelo WebView', e);
    }
  }
  return webGet(url, headers);
}

export function parseJsonBody(body) {
  if (body && typeof body === 'object') return body;
  const s = String(body ?? '').trim();
  if (!s) throw new Error('resposta vazia');
  try {
    return JSON.parse(s);
  } catch {
    throw new Error('resposta inválida');
  }
}

export async function getJson(url, headers = {}) {
  return parseJsonBody(await get(url, { Accept: 'application/json', ...headers }));
}

export async function getText(url, headers = {}) {
  const body = await get(url, headers);
  return typeof body === 'string' ? body : JSON.stringify(body);
}
