// Competições mostradas no app, na ordem em que aparecem na tela.
// espn   = código na API pública da ESPN (fonte principal, sem chave)
// fd     = código no football-data.org (reserva; o plano grátis só tem algumas)
// filter = 'conmebol' → mostra só jogos com uma seleção da América do Sul
export const LEAGUES = [
  { key: 'bra', name: 'Brasileirão', espn: 'bra.1', fd: 'BSA' },
  { key: 'ucl', name: 'Champions League', espn: 'uefa.champions', fd: 'CL' },
  { key: 'eng', name: 'Premier League', espn: 'eng.1', fd: 'PL' },
  { key: 'esp', name: 'Campeonato Espanhol', espn: 'esp.1', fd: 'PD' },
  { key: 'ita', name: 'Campeonato Italiano', espn: 'ita.1', fd: 'SA' },
  { key: 'ger', name: 'Bundesliga', espn: 'ger.1', fd: 'BL1' },
  { key: 'fra', name: 'Campeonato Francês', espn: 'fra.1', fd: 'FL1' },
  { key: 'por', name: 'Campeonato Português', espn: 'por.1', fd: 'PPL' },
  { key: 'uel', name: 'Liga Europa', espn: 'uefa.europa', fd: null },
  { key: 'lib', name: 'Libertadores', espn: 'conmebol.libertadores', fd: null },
  { key: 'sud', name: 'Copa Sul-Americana', espn: 'conmebol.sudamericana', fd: null },
  { key: 'cdb', name: 'Copa do Brasil', espn: 'bra.copa_do_brazil', fd: null },
  { key: 'unl', name: 'Liga das Nações (UEFA)', espn: 'uefa.nations', fd: null },
  { key: 'eli', name: 'Eliminatórias (América do Sul)', espn: 'fifa.worldq.conmebol', fd: null },
  { key: 'cam', name: 'Copa América', espn: 'conmebol.america', fd: null },
  { key: 'wc', name: 'Copa do Mundo', espn: 'fifa.world', fd: 'WC' },
  { key: 'ami', name: 'Amistosos de seleções', espn: 'fifa.friendly', fd: null, filter: 'conmebol' },
  { key: 'arg', name: 'Campeonato Argentino', espn: 'arg.1', fd: null },
];

export const leagueByKey = (key) => LEAGUES.find((l) => l.key === key);

// As 10 seleções da CONMEBOL, em português, inglês e espanhol (sem acentos, minúsculas).
const CONMEBOL = [
  'brasil', 'brazil', 'argentina', 'uruguai', 'uruguay', 'colombia', 'chile', 'peru', 'equador', 'ecuador',
  'paraguai', 'paraguay', 'bolivia', 'venezuela',
];

const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** O jogo tem uma seleção principal da América do Sul? */
export function hasConmebolTeam(m) {
  return [m.home, m.away].some((t) => [t.name, ...(t.alt || [])].some((n) => CONMEBOL.includes(plain(n))));
}

/** Aplica o filtro da competição (se tiver). */
export function keepMatch(league, m) {
  if (league.filter === 'conmebol') return hasConmebolTeam(m);
  return true;
}
