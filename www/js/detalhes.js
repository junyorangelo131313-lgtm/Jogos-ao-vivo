// Detalhes de um jogo (golos, cartões, estatísticas, estádio), vindos do "summary" da ESPN.
// Só é pedido quando se toca num jogo.
import { espnJson } from './espnhost.js';

const PATH = '/apis/site/v2/sports/soccer';
const cache = new Map(); // id do jogo -> { at, data }

export const espnEventId = (m) => (String(m.id).startsWith('espn:') ? String(m.id).slice(5) : null);

function kindOf(type = '') {
  const t = String(type);
  if (t === 'own-goal') return 'own';
  if (/^penalty---scored/.test(t)) return 'pen';
  if (/^goal/.test(t)) return 'goal';
  if (/red/.test(t)) return 'red';
  if (/yellow/.test(t)) return 'yellow';
  return null;
}

// [chave da ESPN, nome em português]
const STATS = [
  ['possessionPct', 'Posse de bola (%)'],
  ['totalShots', 'Remates'],
  ['shotsOnTarget', 'Remates à baliza'],
  ['wonCorners', 'Cantos'],
  ['foulsCommitted', 'Faltas'],
  ['offsides', 'Foras de jogo'],
  ['yellowCards', 'Cartões amarelos'],
  ['redCards', 'Cartões vermelhos'],
  ['saves', 'Defesas do guarda-redes'],
];

/** Lê a resposta da ESPN (sem efeitos: testado em tests/). */
export function parseSummary(s) {
  const comp = s?.header?.competitions?.[0] || {};
  const cs = comp.competitors || [];
  const home = cs.find((c) => c.homeAway === 'home') || cs[0] || {};
  const away = cs.find((c) => c.homeAway === 'away') || cs[1] || {};
  const side = (teamId) => (String(teamId) === String(home.team?.id) ? 'home' : String(teamId) === String(away.team?.id) ? 'away' : null);

  const events = [];
  for (const e of s?.keyEvents || []) {
    const kind = kindOf(e.type?.type);
    if (!kind) continue;
    const ps = (e.participants || []).map((p) => p.athlete?.displayName).filter(Boolean);
    events.push({
      kind,
      minute: e.clock?.displayValue || '',
      order: Number(e.clock?.value) || 0,
      side: side(e.team?.id),
      player: ps[0] || '',
      assist: (kind === 'goal' || kind === 'pen') ? (ps[1] || '') : '',
    });
  }
  events.sort((a, b) => a.order - b.order);

  const statsOf = (teamId) => {
    const t = (s?.boxscore?.teams || []).find((x) => String(x.team?.id) === String(teamId));
    return Object.fromEntries((t?.statistics || []).map((x) => [x.name, x.displayValue]));
  };
  const hs = statsOf(home.team?.id);
  const as = statsOf(away.team?.id);
  const stats = STATS
    .filter(([k]) => hs[k] != null && as[k] != null)
    .map(([k, label]) => ({ label, home: hs[k], away: as[k] }));

  const v = s?.gameInfo?.venue;
  const city = v?.address?.city;
  const ref = (s?.gameInfo?.officials || [])[0]?.displayName || '';
  const st = comp.status || {};
  return {
    events,
    stats,
    venue: v?.fullName ? `${v.fullName}${city ? `, ${city}` : ''}` : '',
    referee: ref,
    attendance: Number(s?.gameInfo?.attendance) || 0,
    score: home.score != null && away.score != null ? { home: Number(home.score), away: Number(away.score) } : null,
    status: st.type?.state || '',
    clock: st.type?.shortDetail || st.displayClock || '',
  };
}

/** Pede os detalhes (guarda 2 min com o jogo a decorrer, 12 h nos outros casos). */
export async function fetchDetails(m, league, force = false) {
  const id = espnEventId(m);
  if (!id || !league?.espn) throw new Error('Detalhes indisponíveis para este jogo.');
  const ttl = m.state === 'live' ? 2 * 60 * 1000 : 12 * 60 * 60 * 1000;
  const c = cache.get(m.id);
  if (!force && c && Date.now() - c.at < ttl) return c.data;
  const data = parseSummary(await espnJson(`${PATH}/${league.espn}/summary?event=${encodeURIComponent(id)}&lang=pt&region=br`));
  cache.set(m.id, { at: Date.now(), data });
  return data;
}

export const cachedDetails = (m) => cache.get(m.id)?.data || null;
