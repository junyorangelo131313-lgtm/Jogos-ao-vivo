// Fonte principal: placares públicos da ESPN (grátis, sem chave, inclui o
// Campeonato Argentino e o minuto do jogo ao vivo).
import { getJson } from '../http.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

export function espnUrl(league, fromKey, toKey) {
  const d = (k) => k.replaceAll('-', '');
  return `${BASE}/${league.espn}/scoreboard?dates=${d(fromKey)}-${d(toKey)}&limit=300&lang=pt&region=br`;
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

export async function fetchEspn(league, fromKey, toKey) {
  const data = await getJson(espnUrl(league, fromKey, toKey));
  return parseEspn(data, league);
}
