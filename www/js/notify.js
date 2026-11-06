// Avisos no telemóvel 30 minutos antes dos jogos dos times favoritos.
// Os avisos ficam marcados no próprio Android: aparecem mesmo com o app fechado.
import { hhmm } from './time.js';

export const BEFORE_MIN = 30;
const KEY = 'jogos-ao-vivo:avisos:v1';
const MAX = 40; // o Android limita a quantidade de alarmes por app

function load() {
  try { return { on: true, ids: [], asked: false, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { on: true, ids: [], asked: false }; }
}
function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem armazenamento */ }
}

function bridge() {
  const cap = globalThis.Capacitor;
  if (!cap || typeof cap.nativePromise !== 'function') return null;
  const native = typeof cap.isNativePlatform === 'function' ? cap.isNativePlatform() : cap.getPlatform?.() !== 'web';
  return native ? cap : null;
}

const call = (cap, method, opts = {}) => cap.nativePromise('LocalNotifications', method, opts);

/** Número inteiro estável (o Android exige id numérico) a partir do id do jogo. */
export function notifId(matchId) {
  let h = 0;
  for (const c of String(matchId)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 2000000000 + 1;
}

/** Lista de avisos a marcar (sem efeitos: testada em tests/). */
export function buildNotifications(matches, { isFav, leagueName, channelText, now = Date.now() }) {
  return matches
    .filter((m) => m.state === 'pre' && isFav(m))
    .map((m) => ({ m, at: Date.parse(m.start) - BEFORE_MIN * 60 * 1000 }))
    .filter(({ at }) => at > now + 30 * 1000)
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX)
    .map(({ m, at }) => ({
      id: notifId(m.id),
      title: `★ ${m.home.name} x ${m.away.name} às ${hhmm(new Date(m.start))}`,
      body: `${leagueName(m.league)} · ${channelText(m)} · começa daqui a ${BEFORE_MIN} min`,
      schedule: { at: new Date(at).toISOString(), allowWhileIdle: true },
      extra: { matchId: m.id },
    }));
}

export const enabled = () => load().on;
export const available = () => Boolean(bridge());

/** Pede autorização para mostrar avisos (Android 13+). Devolve true se autorizado. */
async function ensurePermission(cap) {
  try {
    let p = await call(cap, 'checkPermissions');
    if (p?.display !== 'granted') p = await call(cap, 'requestPermissions');
    return p?.display === 'granted';
  } catch (e) {
    console.warn('avisos: autorização', e);
    return false;
  }
}

/** Marca de novo todos os avisos (substitui os antigos). */
export async function sync(matches, helpers) {
  const cap = bridge();
  if (!cap) return { ok: false, reason: 'web' };
  const s = load();
  const wanted = s.on ? buildNotifications(matches, helpers) : [];
  try {
    const keep = new Set(wanted.map((n) => n.id));
    const old = (s.ids || []).filter((id) => !keep.has(id));
    if (old.length) await call(cap, 'cancel', { notifications: old.map((id) => ({ id })) });
    if (wanted.length) {
      if (!(await ensurePermission(cap))) { save({ ...s, ids: [] }); return { ok: false, reason: 'permission' }; }
      await call(cap, 'schedule', { notifications: wanted });
    }
    save({ ...s, ids: wanted.map((n) => n.id) });
    return { ok: true, count: wanted.length };
  } catch (e) {
    console.warn('avisos', e);
    return { ok: false, reason: String(e?.message || e) };
  }
}

export function setEnabled(on) {
  save({ ...load(), on });
}
