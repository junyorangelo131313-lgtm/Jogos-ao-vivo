// Competições mostradas no app, na ordem em que aparecem na tela.
// espn   = código na API pública da ESPN (fonte principal, sem chave)
// fd     = código no football-data.org (reserva; o plano grátis só tem algumas)
// filter = 'conmebol' → mostra só jogos com uma seleção da América do Sul
// color  = cor do campeonato na tela
// usual  = canais que costumam ter os direitos no Brasil; mostrados como "(provável)"
//          quando o site de canais não lista o jogo
export const LEAGUES = [
  { key: 'bra', name: 'Brasileirão', espn: 'bra.1', fd: 'BSA', color: '#22c55e' },
  { key: 'ucl', name: 'Champions League', espn: 'uefa.champions', fd: 'CL', color: '#3b82f6' },
  { key: 'eng', name: 'Premier League', espn: 'eng.1', fd: 'PL', color: '#a855f7' },
  { key: 'esp', name: 'Campeonato Espanhol', espn: 'esp.1', fd: 'PD', color: '#f97316' },
  { key: 'ita', name: 'Campeonato Italiano', espn: 'ita.1', fd: 'SA', color: '#06b6d4' },
  { key: 'ger', name: 'Bundesliga', espn: 'ger.1', fd: 'BL1', color: '#ef4444' },
  { key: 'fra', name: 'Campeonato Francês', espn: 'fra.1', fd: 'FL1', color: '#6366f1' },
  { key: 'por', name: 'Campeonato Português', espn: 'por.1', fd: 'PPL', color: '#10b981' },
  { key: 'uel', name: 'Liga Europa', espn: 'uefa.europa', fd: null, color: '#f59e0b' },
  { key: 'lib', name: 'Libertadores', espn: 'conmebol.libertadores', fd: null, color: '#eab308' },
  { key: 'sud', name: 'Copa Sul-Americana', espn: 'conmebol.sudamericana', fd: null, color: '#14b8a6' },
  { key: 'cdb', name: 'Copa do Brasil', espn: 'bra.copa_do_brazil', fd: null, color: '#84cc16' },
  { key: 'unl', name: 'Liga das Nações (UEFA)', espn: 'uefa.nations', fd: null, color: '#8b5cf6' },
  { key: 'eli', name: 'Eliminatórias (América do Sul)', espn: 'fifa.worldq.conmebol', fd: null, color: '#facc15' },
  { key: 'cam', name: 'Copa América', espn: 'conmebol.america', fd: null, color: '#0ea5e9' },
  { key: 'wc', name: 'Copa do Mundo', espn: 'fifa.world', fd: 'WC', color: '#d946ef' },
  { key: 'ami', name: 'Amistosos de seleções', espn: 'fifa.friendly', fd: null, filter: 'conmebol', color: '#ec4899' },
  { key: 'arg', name: 'Campeonato Argentino', espn: 'arg.1', fd: null, color: '#38bdf8', usual: ['ESPN', 'Disney+'] },
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
