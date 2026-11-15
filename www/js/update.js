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

export const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // "Depois": esconde o aviso grande durante 7 dias

/**
 * Como avisar de uma versão nova:
 *  'none'   – não há versão mais nova (ou é a versão de testes no navegador);
 *  'banner' – aviso verde grande;
 *  'quiet'  – só uma linha discreta no fundo (a pessoa tocou em "Depois" há menos de 7 dias,
 *             mesmo que entretanto tenham saído outras versões).
 */
export function offerState(remote, current, snoozedAt = 0, now = Date.now()) {
  if (!current || !(remote > current)) return 'none';
  return snoozedAt && now - snoozedAt < SNOOZE_MS ? 'quiet' : 'banner';
}

/** Devolve { versionCode, notes, mode } se houver versão nova, senão null. */
export async function checkUpdate(force = false) {
  const s = load();
  const cur = currentVersion();
  if (!cur) return null; // versão de testes no navegador: sem aviso
  let latest = s.latest || 0;
  let notes = s.notes || '';
  if (force || !s.checkedAt || Date.now() - s.checkedAt >= EVERY) {
    const v = await getJson(`${VERSION_URL}?t=${Date.now()}`);
    latest = Number(v?.versionCode) || 0;
    notes = v?.notes || '';
    save({ ...s, checkedAt: Date.now(), latest, notes });
  }
  const mode = offerState(latest, cur, s.snoozedAt);
  return mode === 'none' ? null : { versionCode: latest, notes, mode };
}

/** "Depois": esconde o aviso grande durante 7 dias. */
export function dismiss() {
  save({ ...load(), snoozedAt: Date.now() });
}
