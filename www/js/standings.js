// Classificação dos campeonatos (ESPN, grátis, sem chave).
// É pedida só quando se abre a classificação de um campeonato e fica guardada 6 horas.
import { getJson } from './http.js';

const BASE = 'https://site.api.espn.com/apis/v2/sports/soccer';
const KEY = 'jogos-ao-vivo:tabela:v1';
const MAX_AGE = 6 * 60 * 60 * 1000;

// Textos que a ESPN às vezes manda em inglês.
const PT = [
  [/^Group\s+/i, 'Grupo '], [/^League Phase$/i, 'Fase de liga'],
  [/Qualifies for World Cup/i, 'Classificado para a Copa do Mundo'], [/World Cup Qualifying Playoff|Intercontinental playoff/i, 'Repescagem para a Copa'],
  [/Qualifies for QFs/i, 'Quartas de final'], [/Promotion playoffs?/i, 'Play-off de subida'], [/Relegation playoffs?/i, 'Play-off de descida'],
  [/^Relegation$/i, 'Rebaixamento'], [/^Promotion$/i, 'Subida'], [/Knockout round play-?offs?/i, 'Play-off dos oitavos'],
  [/Round of 16/i, 'Oitavas de final'], [/Eliminated/i, 'Eliminado'],
];
export const toPt = (t) => PT.reduce((acc, [re, rep]) => acc.replace(re, rep), String(t || ''));

const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

/** Lê a resposta da ESPN: um ou vários grupos (ex.: Liga das Nações), cada um com a sua tabela. */
export function parseStandings(data) {
  const groups = Array.isArray(data?.children) && data.children.length ? data.children : (data?.standings ? [data] : []);
  return groups.map((g) => {
    const rows = (g.standings?.entries || []).map((e, i) => {
      const st = {};
      for (const s of e.stats || []) st[s.name || s.type] = s.value ?? s.displayValue;
      const gf = num(st.pointsFor);
      const ga = num(st.pointsAgainst);
      return {
        rank: num(st.rank) || i + 1,
        id: e.team?.id ? String(e.team.id) : null,
        team: e.team?.displayName || e.team?.shortDisplayName || e.team?.name || '?',
        short: e.team?.shortDisplayName || e.team?.abbreviation || '',
        logo: e.team?.logos?.[0]?.href || null,
        played: num(st.gamesPlayed),
        wins: num(st.wins),
        draws: num(st.ties),
        losses: num(st.losses),
        gf,
        ga,
        gd: num(st.pointDifferential) ?? (gf !== null && ga !== null ? gf - ga : null),
        points: num(st.points),
        zone: e.note?.color ? { color: e.note.color.startsWith('#') ? e.note.color : `#${e.note.color}`, text: toPt(e.note.description || '') } : null,
      };
    }).sort((a, b) => a.rank - b.rank);
    return { name: toPt(g.name || g.abbreviation || ''), rows };
  }).filter((g) => g.rows.length);
}

const plain = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Tabela ao vivo: aplica os placares dos jogos a decorrer à classificação oficial e reordena
 * (pontos, saldo, golos marcados). Cada linha ganha:
 *   liveRank – posição agora;  delta – lugares ganhos (+) ou perdidos (−) face à tabela oficial;
 *   live     – { gf, ga, result: 'win' | 'draw' | 'loss' } se a equipa está a jogar.
 */
export function liveTable(groups, liveMatches) {
  const same = (row, t) => (row.id && t.id ? row.id === t.id : plain(row.team) === plain(t.name) || (t.alt || []).some((a) => plain(a) === plain(row.team)));
  return groups.map((g) => {
    const rows = g.rows.map((r) => {
      let live = null;
      for (const m of liveMatches) {
        if (!m.score) continue;
        const home = same(r, m.home);
        if (!home && !same(r, m.away)) continue;
        const gf = home ? m.score.home : m.score.away;
        const ga = home ? m.score.away : m.score.home;
        live = { gf, ga, result: gf > ga ? 'win' : gf === ga ? 'draw' : 'loss', minute: m.minute || '' };
        break;
      }
      if (!live) return { ...r, live: null };
      const pts = live.result === 'win' ? 3 : live.result === 'draw' ? 1 : 0;
      return {
        ...r,
        live,
        played: r.played === null ? null : r.played + 1,
        wins: r.wins === null ? null : r.wins + (live.result === 'win' ? 1 : 0),
        draws: r.draws === null ? null : r.draws + (live.result === 'draw' ? 1 : 0),
        losses: r.losses === null ? null : r.losses + (live.result === 'loss' ? 1 : 0),
        gf: r.gf === null ? null : r.gf + live.gf,
        ga: r.ga === null ? null : r.ga + live.ga,
        gd: r.gd === null ? null : r.gd + live.gf - live.ga,
        points: r.points === null ? null : r.points + pts,
      };
    });
    const anyLive = rows.some((r) => r.live);
    const sorted = anyLive
      ? [...rows].sort((a, b) => (b.points ?? 0) - (a.points ?? 0) || (b.gd ?? 0) - (a.gd ?? 0) || (b.gf ?? 0) - (a.gf ?? 0) || a.rank - b.rank)
      : rows;
    return {
      ...g,
      live: anyLive,
      rows: sorted.map((r, i) => ({ ...r, liveRank: anyLive ? i + 1 : r.rank, delta: anyLive ? r.rank - (i + 1) : 0 })),
    };
  });
}

function loadAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

export function cached(leagueKey) {
  return loadAll()[leagueKey] || null;
}

export async function fetchStandings(league, force = false) {
  const all = loadAll();
  const c = all[league.key];
  if (!force && c && Date.now() - c.fetchedAt < MAX_AGE) return c;
  let data;
  try {
    data = await getJson(`${BASE}/${league.espn}/standings?lang=pt&region=br`);
  } catch {
    data = await getJson(`${BASE}/${league.espn}/standings`);
  }
  const groups = parseStandings(data);
  const entry = { groups, fetchedAt: Date.now() };
  all[league.key] = entry;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* sem espaço */ }
  return entry;
}
