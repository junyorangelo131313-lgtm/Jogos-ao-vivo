// Fonte principal: placares públicos da ESPN (grátis, sem chave, inclui o
// Campeonato Argentino e o minuto do jogo ao vivo).
import { getJson } from '../http.js';
import { addDays } from '../time.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

/** URL de um dia (fromKey === toKey) ou de um período. */
export function espnUrl(league, fromKey, toKey = fromKey, localized = true) {
  const d = (k) => k.replaceAll('-', '');
  const dates = fromKey === toKey ? d(fromKey) : `${d(fromKey)}-${d(toKey)}`;
  const lang = localized ? '&lang=pt&region=br' : '';
  return `${BASE}/${league.espn}/scoreboard?dates=${dates}${lang}`;
}

/** Lista de dias entre duas chaves AAAA-MM-DD (inclusive). */
export function daysBetween(fromKey, toKey) {
  const out = [];
  for (let k = fromKey; k <= toKey && out.length < 60; k = addDays(k, 1)) out.push(k);
  return out;
}

function team(c) {
  const t = c?.team || {};
  return {
    name: t.displayName || t.shortDisplayName || t.name || '?',
    alt: [t.shortDisplayName, t.name, t.location, t.abbreviation].filter(Boolean),
  };
}

function toState(type = {}) {
  const name = String(type.name || '');
  if (/POSTPONED|CANCELED|CANCELLED|SUSPENDED|ABANDONED|DELAYED/.test(name)) return 'off';
  if (type.state === 'in') return 'live';
  if (type.state === 'post' || type.completed) return 'done';
  return 'pre';
}

export function parseEspn(data, league) {
  const out = [];
  for (const ev of data?.events || []) {
    const comp = ev.competitions?.[0] || {};
    const cs = comp.competitors || [];
    const home = cs.find((c) => c.homeAway === 'home') || cs[0];
    const away = cs.find((c) => c.homeAway === 'away') || cs[1];
    if (!home || !away || !ev.date) continue;
    const status = ev.status || comp.status || {};
    const state = toState(status.type);
    const hasScore = state === 'live' || state === 'done';
    out.push({
      id: `espn:${ev.id}`,
      league: league.key,
      start: new Date(ev.date).toISOString(),
      home: team(home),
      away: team(away),
      state,
      score: hasScore ? { home: Number(home.score ?? 0), away: Number(away.score ?? 0) } : null,
      minute: state === 'live' ? (status.type?.shortDetail || status.displayClock || '') : '',
      channels: [],
    });
  }
  return out;
}

async function getEvents(url) {
  const data = await getJson(url);
  if (!Array.isArray(data?.events)) throw new Error(data?.message ? `ESPN: ${data.message}` : 'resposta sem jogos');
  return data;
}

/** Um dia: tenta com português e, se falhar, sem idioma/região. */
async function fetchDay(league, key) {
  try {
    return parseEspn(await getEvents(espnUrl(league, key)), league);
  } catch (e) {
    try {
      return parseEspn(await getEvents(espnUrl(league, key, key, false)), league);
    } catch { throw e; }
  }
}

// A ESPN deixou de aceitar períodos ("dates=AAAAMMDD-AAAAMMDD" responde HTTP 400).
// Por isso tentamos o período uma vez (é mais rápido se voltar a funcionar) e,
// se falhar, pedimos dia a dia, poucos de cada vez.
let rangeWorks = true;
const PARALLEL_DAYS = 4;

export async function fetchEspn(league, fromKey, toKey) {
  if (fromKey === toKey) return fetchDay(league, fromKey);
  if (rangeWorks) {
    try {
      return parseEspn(await getEvents(espnUrl(league, fromKey, toKey)), league);
    } catch (e) {
      if (!/^HTTP 4|ESPN:/.test(e.message)) throw e; // sem internet: não adianta insistir
      rangeWorks = false;
    }
  }
  const days = daysBetween(fromKey, toKey);
  const out = [];
  const seen = new Set();
  let ok = 0;
  let lastErr;
  for (let i = 0; i < days.length; i += PARALLEL_DAYS) {
    const res = await Promise.allSettled(days.slice(i, i + PARALLEL_DAYS).map((k) => fetchDay(league, k)));
    for (const r of res) {
      if (r.status === 'rejected') { lastErr = r.reason; continue; }
      ok += 1;
      for (const m of r.value) if (!seen.has(m.id)) { seen.add(m.id); out.push(m); }
    }
  }
  if (!ok) throw lastErr || new Error('sem dados');
  return out;
}
