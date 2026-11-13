// Fonte principal: placares públicos da ESPN (grátis, sem chave, inclui o
// Campeonato Argentino e o minuto do jogo ao vivo).
import { espnJson, rememberSeason, seasonPlan, HOSTS } from '../espnhost.js';
import { addDays } from '../time.js';
import { keepMatch } from '../leagues.js';

const PATH = '/apis/site/v2/sports/soccer';

/** URL de um dia (fromKey === toKey) ou de um período. */
export function espnPath(league, fromKey, toKey = fromKey, localized = true) {
  const d = (k) => k.replaceAll('-', '');
  const dates = fromKey === toKey ? d(fromKey) : `${d(fromKey)}-${d(toKey)}`;
  const lang = localized ? '&lang=pt&region=br' : '';
  return `${PATH}/${league.espn}/scoreboard?dates=${dates}${lang}`;
}

export const espnUrl = (...a) => HOSTS[0] + espnPath(...a);

/** Lista de dias entre duas chaves AAAA-MM-DD (inclusive). */
export function daysBetween(fromKey, toKey) {
  const out = [];
  for (let k = fromKey; k <= toKey && out.length < 60; k = addDays(k, 1)) out.push(k);
  return out;
}

function team(c) {
  const t = c?.team || {};
  return {
    id: t.id ? String(t.id) : null,
    name: t.displayName || t.shortDisplayName || t.name || '?',
    alt: [t.shortDisplayName, t.name, t.location, t.abbreviation].filter(Boolean),
    abbr: t.abbreviation || '',
    logo: t.logo || t.logos?.[0]?.href || '',
  };
}

function toState(type = {}) {
  const name = String(type.name || '');
  if (/POSTPONED|CANCELED|CANCELLED|SUSPENDED|ABANDONED|DELAYED/.test(name)) return 'off';
  if (type.state === 'in') return 'live';
  if (type.state === 'post' || type.completed) return 'done';
  return 'pre';
}

/** Golos do jogo, a partir dos "details" da lista da ESPN (sem pedidos extra). */
export function parseGoals(details, homeId, awayId) {
  const out = [];
  for (const d of details || []) {
    if (!d?.scoringPlay || d.shootout) continue;
    const tid = String(d.team?.id ?? '');
    const side = tid && tid === String(homeId) ? 'home' : tid && tid === String(awayId) ? 'away' : null;
    if (!side) continue;
    const a = d.athletesInvolved?.[0] || {};
    out.push({
      side,
      player: a.shortName || a.displayName || '?',
      minute: d.clock?.displayValue || '',
      order: Number(d.clock?.value) || 0,
      kind: d.ownGoal ? 'own' : d.penaltyKick ? 'pen' : 'goal',
    });
  }
  return out.sort((x, y) => x.order - y.order).map(({ order, ...g }) => g);
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
      goals: hasScore ? parseGoals(comp.details, home.team?.id, away.team?.id) : [],
      venue: comp.venue?.fullName || '',
      channels: [],
    });
  }
  return out.filter((m) => keepMatch(league, m));
}

// Limite de pedidos ao mesmo tempo (para todas as competições juntas),
// para não sobrecarregar o telemóvel nem a ESPN.
const MAX_PARALLEL = 8;
let running = 0;
const waiting = [];
async function limited(fn) {
  if (running >= MAX_PARALLEL) await new Promise((r) => waiting.push(r));
  running += 1;
  try { return await fn(); } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

async function getEvents(path) {
  const data = await limited(() => espnJson(path));
  if (!Array.isArray(data?.events)) throw new Error(data?.message ? `ESPN: ${data.message}` : 'resposta sem jogos');
  return data;
}

/** Um dia: tenta com português e, se falhar, sem idioma/região. */
async function fetchDay(league, key) {
  let data;
  try {
    data = await getEvents(espnPath(league, key));
  } catch (e) {
    try {
      data = await getEvents(espnPath(league, key, key, false));
    } catch { throw e; }
  }
  rememberSeason(league.key, data);
  return parseEspn(data, league);
}

// A ESPN deixou de aceitar períodos ("dates=AAAAMMDD-AAAAMMDD" responde HTTP 400).
// Por isso tentamos o período uma vez (é mais rápido se voltar a funcionar) e,
// se falhar, pedimos dia a dia, poucos de cada vez.
let rangeWorks = true;
const PARALLEL_DAYS = 16; // o limite real é o MAX_PARALLEL acima

export async function fetchEspn(league, fromKey, toKey) {
  // Fora de época (ex.: Estaduais em novembro): não pede nada, ou só um dia para reconfirmar.
  const plan = seasonPlan(league.key, fromKey, toKey);
  if (plan === 'skip') return [];
  if (plan === 'probe') {
    const ms = await fetchDay(league, fromKey); // um só pedido, que atualiza a época
    if (seasonPlan(league.key, fromKey, toKey) !== 'full') return ms; // continua fora de época
  }
  if (fromKey === toKey) return fetchDay(league, fromKey);
  if (rangeWorks) {
    try {
      return parseEspn(await getEvents(espnPath(league, fromKey, toKey)), league);
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
