// Regras do app que não dependem da tela (testadas em tests/).
import { addDays, dayKey as dayKeyOf } from './time.js';
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

/** Porque é que um jogo não tem canal: 'indisponivel' (nenhuma fonte respondeu), 'sem' (as duas responderam,
 *  o jogo é hoje e nenhuma o lista) ou 'confirmar' (ainda pode aparecer: jogo de amanhã ou só uma fonte respondeu). */
export function channelStatus(m, src, todayKey, key = (d) => dayKeyOf(d)) {
  if (!src) return 'confirmar';
  if (!src.ok1 && !src.ok2) return 'indisponivel';
  if (src.ok1 && src.ok2 && key(new Date(m.start)) === todayKey) return 'sem';
  return 'confirmar';
}

/** De quanto em quanto tempo voltar a procurar os canais em falta. */
export function channelsMaxAge(missing, src, now = Date.now()) {
  if (src && !src.ok1 && !src.ok2) return 10 * 60 * 1000;                                  // as fontes falharam: tenta cedo
  const soon = missing.some((m) => { const t = Date.parse(m.start) - now; return t > 0 && t <= 60 * 60 * 1000; });
  return soon ? 15 * 60 * 1000 : 2 * 60 * 60 * 1000;                                      // última hora antes do jogo: os sites completam a grade
}

/** Atualiza placar/minuto dos jogos antigos com os dados novos, sem perder os canais. */
export function mergeLive(oldList, fresh) {
  const byId = new Map(fresh.map((m) => [m.id, m]));
  return oldList.map((m) => {
    const n = byId.get(m.id);
    return n ? { ...m, state: n.state, score: n.score, minute: n.minute, goals: n.goals || m.goals || [] } : m;
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
