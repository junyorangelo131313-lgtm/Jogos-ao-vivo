// Fonte de reserva: football-data.org (plano grátis, precisa de chave).
// Só é usada se a ESPN falhar e se a chave tiver sido configurada no GitHub.
import { getJson } from '../http.js';
import { LEAGUES } from '../leagues.js';

const BASE = 'https://api.football-data.org/v4';

const STATE = {
  SCHEDULED: 'pre', TIMED: 'pre',
  IN_PLAY: 'live', PAUSED: 'live', LIVE: 'live',
  FINISHED: 'done', AWARDED: 'done',
  POSTPONED: 'off', SUSPENDED: 'off', CANCELLED: 'off',
};

export function parseFootballData(data) {
  const out = [];
  for (const m of data?.matches || []) {
    const league = LEAGUES.find((l) => l.fd === m.competition?.code);
    if (!league) continue;
    const state = STATE[m.status] || 'pre';
    const ft = m.score?.fullTime || {};
    const hasScore = (state === 'live' || state === 'done') && ft.home != null;
    let minute = '';
    if (state === 'live') {
      minute = m.status === 'PAUSED' ? 'Intervalo' : (m.minute ? `${m.minute}'` : 'Ao vivo');
    }
    const t = (x) => ({ name: x?.shortName || x?.name || '?', alt: [x?.name, x?.tla].filter(Boolean), abbr: x?.tla || '', logo: x?.crest || '' });
    out.push({
      id: `fd:${m.id}`,
      league: league.key,
      start: new Date(m.utcDate).toISOString(),
      home: t(m.homeTeam),
      away: t(m.awayTeam),
      state,
      score: hasScore ? { home: ft.home, away: ft.away } : null,
      minute,
      channels: [],
    });
  }
  return out;
}

export async function fetchFootballData(leagues, fromKey, toKey, apiKey) {
  const codes = leagues.map((l) => l.fd).filter(Boolean);
  if (!codes.length || !apiKey) return [];
  const url = `${BASE}/matches?competitions=${codes.join(',')}&dateFrom=${fromKey}&dateTo=${toKey}`;
  const data = await getJson(url, { 'X-Auth-Token': apiKey });
  return parseFootballData(data);
}
