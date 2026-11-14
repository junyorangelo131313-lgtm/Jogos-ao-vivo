// Regras do app que não dependem da tela (testadas em tests/).
import { addDays } from './time.js';
const LIVE_WINDOW_MS = 150 * 60 * 1000; // um jogo dura ~2h com intervalo e acréscimos

export const isSantos = (m) => [m.home.name, m.away.name].some((n) => /\bsantos\b/i.test(n) && !/laguna/i.test(n));

/** Jogo a decorrer: a fonte diz "ao vivo", ou já passou da hora e ainda não temos o resultado. */
export function isLiveish(m, now = Date.now()) {
  if (m.state === 'live') return true;
  const t = Date.parse(m.start);
  return m.state === 'pre' && t <= now && now - t < LIVE_WINDOW_MS;
}

export function sortMatches(list) {
  return [...list].sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.home.name.localeCompare(b.home.name));
}

/** Campeonatos de um dia pela hora do primeiro jogo (o das 18:00 antes do das 22:00); empate: a ordem da lista de campeonatos. */
export function leaguesByKickoff(matches, leagues) {
  const first = new Map();
  for (const m of matches) {
    const t = Date.parse(m.start);
    if (!first.has(m.league) || t < first.get(m.league)) first.set(m.league, t);
  }
  return leagues.filter((l) => first.has(l.key))
    .map((l, i) => ({ l, i, t: first.get(l.key) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.l);
}

/**
 * Endereços possíveis do escudo, por ordem: o que a ESPN mandou, o endereço padrão da ESPN pelo código
 * do time e, nas seleções, a bandeira do país pela sigla. O app tenta um de cada vez.
 */
export function crestUrls(t, national = false) {
  const out = [];
  if (t?.logo) out.push(t.logo);
  const ab = String(t?.abbr || '').toLowerCase();
  if (national && /^[a-z]{2,4}$/.test(ab)) out.push(`https://a.espncdn.com/i/teamlogos/countries/500/${ab}.png`);
  if (t?.id && /^\d+$/.test(String(t.id))) out.push(`https://a.espncdn.com/i/teamlogos/soccer/500/${t.id}.png`);
  return [...new Set(out)];
}

/**
 * A competição aparece aberta ou fechada?
 * Se a pessoa já abriu/fechou essa competição, vale a escolha dela (fica guardada).
 * Senão: aberta se tiver poucos jogos, ou se houver jogo ao vivo / de um time favorito.
 */
export function leagueOpen(pref, count, priority, limit = 10) {
  if (pref === true || pref === false) return pref;
  return count <= limit || Boolean(priority);
}

/** Atualiza placar/minuto dos jogos antigos com os dados novos, sem perder os canais. */
export function mergeLive(oldList, fresh) {
  const byId = new Map(fresh.map((m) => [m.id, m]));
  return oldList.map((m) => {
    const n = byId.get(m.id);
    if (!n) return m;
    const out = { ...m, state: n.state, score: n.score, minute: n.minute, goals: n.goals || m.goals || [] };
    // Traz também os escudos novos (jogos guardados antes de haver escudos).
    if (n.home) out.home = { ...m.home, ...n.home };
    if (n.away) out.away = { ...m.away, ...n.away };
    return out;
  });
}

/** Quando fazer a próxima atualização ao vivo (ms a partir de agora), ou null se não houver jogos. */
export function nextLiveDelay(matches, lastLiveFetch, interval, now = Date.now()) {
  if (matches.some((m) => isLiveish(m, now))) {
    return Math.max(0, lastLiveFetch + interval - now);
  }
  const upcoming = matches
    .filter((m) => m.state === 'pre' && Date.parse(m.start) > now)
    .map((m) => Date.parse(m.start) - now);
  if (!upcoming.length) return null;
  // Acorda 2 minutos depois do próximo início.
  return Math.min(...upcoming) + 2 * 60 * 1000;
}

/** Lista de dias (AAAA-MM-DD) do calendário, a começar em `first`. */
export function calendarDays(first, n) {
  return Array.from({ length: n }, (_, i) => addDays(first, i));
}

const RESULT_AFTER_MS = 110 * 60 * 1000; // ~ fim do jogo (90' + intervalo + acréscimos)

/** Jogo que já deve ter acabado mas ainda não temos o placar final (ex.: o app estava fechado). */
export function needsResult(m, now = Date.now(), lastFetch = 0) {
  if (m.state !== 'pre' && m.state !== 'live') return false;
  const end = Date.parse(m.start) + RESULT_AFTER_MS;
  return end < now && lastFetch < end;
}

/** Golos agrupados por jogador e por lado: [{ player, marks: "4', 14' (p)" }] (testado em tests/). */
export function goalLines(goals, side) {
  const by = new Map();
  for (const g of goals || []) {
    if (g.side !== side) continue;
    const key = `${g.player}|${g.kind === 'own' ? 'own' : ''}`;
    if (!by.has(key)) by.set(key, { player: g.player, own: g.kind === 'own', mins: [] });
    by.get(key).mins.push(g.minute + (g.kind === 'pen' ? ' (pên.)' : ''));
  }
  return [...by.values()].map((x) => ({ player: x.player + (x.own ? ' (contra)' : ''), marks: x.mins.join(', ') }));
}
