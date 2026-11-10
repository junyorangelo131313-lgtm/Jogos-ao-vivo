// Pedidos à ESPN com servidor de reserva.
// O servidor principal (site.api) às vezes bloqueia com "Access Denied" (HTTP 403) depois de
// muitos pedidos; o alternativo (site.web.api) dá os mesmos dados. Se um falhar, usamos o outro
// e ficamos com ele até voltar a falhar.
import { getJson } from './http.js';
import { addDays } from './time.js';

export const HOSTS = ['https://site.api.espn.com', 'https://site.web.api.espn.com'];
let preferred = 0;

const retryable = (e) => /^HTTP (403|429|5\d\d)|resposta inválida|resposta vazia/.test(String(e?.message || e));

/** GET de um caminho da ESPN (ex.: "/apis/site/v2/sports/soccer/bra.1/scoreboard?dates=20261110"). */
export async function espnJson(path) {
  let lastErr;
  for (let i = 0; i < HOSTS.length; i += 1) {
    const idx = (preferred + i) % HOSTS.length;
    try {
      const data = await getJson(HOSTS[idx] + path);
      preferred = idx;
      return data;
    } catch (e) {
      lastErr = e;
      if (!retryable(e)) throw e; // sem internet: não adianta tentar o outro servidor
    }
  }
  throw lastErr;
}

/* ---------- Épocas: para não pedir dias em que a competição não joga ---------- */

const SEASON_KEY = 'jogos-ao-vivo:epocas:v1';
const SEASON_TTL = 3 * 24 * 60 * 60 * 1000; // volta a confirmar a época de 3 em 3 dias
const MARGIN = 3; // dias de folga antes/depois da época

function loadSeasons() {
  try { return JSON.parse(globalThis.localStorage?.getItem(SEASON_KEY) || '{}') || {}; } catch { return {}; }
}
let seasons = loadSeasons();

/** Início e fim da época, a partir da resposta do "scoreboard" da ESPN. */
export function seasonOf(data) {
  const lg = data?.leagues?.[0];
  const cal = Array.isArray(lg?.calendar) ? lg.calendar : [];
  const first = cal[0]?.startDate || (typeof cal[0] === 'string' ? cal[0] : null);
  const lastC = cal[cal.length - 1];
  const last = lastC?.endDate || (typeof lastC === 'string' ? lastC : null);
  const start = first || lg?.season?.startDate;
  const end = last || lg?.season?.endDate;
  if (!start || !end) return null;
  return { start: String(start).slice(0, 10), end: String(end).slice(0, 10) };
}

export function rememberSeason(key, data, now = Date.now()) {
  const s = seasonOf(data);
  if (!s) return;
  seasons[key] = { ...s, at: now };
  try { globalThis.localStorage?.setItem(SEASON_KEY, JSON.stringify(seasons)); } catch { /* sem armazenamento */ }
}

/** O período pedido fica todo fora da época conhecida (com folga)? */
export function outOfSeason(win, fromKey, toKey) {
  if (!win?.start || !win?.end) return false;
  return toKey < addDays(win.start, -MARGIN) || fromKey > addDays(win.end, MARGIN);
}

/**
 * Decide o que pedir: 'skip' (fora de época, confirmado há pouco), 'probe' (fora de época mas é
 * preciso reconfirmar: basta um pedido) ou 'full'.
 */
export function seasonPlan(key, fromKey, toKey, now = Date.now()) {
  const w = seasons[key];
  if (!w || !outOfSeason(w, fromKey, toKey)) return 'full';
  return now - (w.at || 0) < SEASON_TTL ? 'skip' : 'probe';
}

/** Para os testes. */
export function _setSeasons(v) { seasons = v; }
