// Aviso de versão nova: compara a versão deste APK (gravada no config.js durante a compilação)
// com o version.json publicado ao lado do APK mais recente. Verifica no máximo de 6 em 6 horas.
import { getJson } from './http.js';

const BASE = 'https://github.com/junyorangelo131313-lgtm/Jogos-ao-vivo/releases/latest/download';
export const APK_URL = `${BASE}/JogosAoVivo.apk`;
const VERSION_URL = `${BASE}/version.json`;
const KEY = 'jogos-ao-vivo:update:v1';
const EVERY = 6 * 60 * 60 * 1000;

export const currentVersion = () => Number(globalThis.APP_CONFIG?.appVersion) || 0;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem armazenamento */ }
}

/** Há uma versão mais nova do que a instalada? (e o utilizador não a dispensou) */
export function shouldOffer(remote, current, dismissed) {
  return Boolean(current) && remote > current && remote !== dismissed;
}

/** Devolve { versionCode, notes } se houver versão nova para oferecer, senão null. */
export async function checkUpdate(force = false) {
  const s = load();
  const cur = currentVersion();
  if (!cur) return null; // versão de testes no navegador: sem aviso
  if (!force && s.checkedAt && Date.now() - s.checkedAt < EVERY) {
    return shouldOffer(s.latest || 0, cur, s.dismissed) ? { versionCode: s.latest, notes: s.notes || '' } : null;
  }
  const v = await getJson(`${VERSION_URL}?t=${Date.now()}`);
  const latest = Number(v?.versionCode) || 0;
  save({ ...s, checkedAt: Date.now(), latest, notes: v?.notes || '' });
  return shouldOffer(latest, cur, s.dismissed) ? { versionCode: latest, notes: v?.notes || '' } : null;
}

export function dismiss(versionCode) {
  save({ ...load(), dismissed: versionCode });
}
