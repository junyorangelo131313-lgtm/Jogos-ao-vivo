// Competições mostradas no app, na ordem em que aparecem na tela.
// espn   = código na API pública da ESPN (fonte principal, sem chave)
// fd     = código no football-data.org (reserva; o plano grátis só tem algumas)
// filter = 'conmebol' → mostra só jogos com uma seleção da América do Sul
// color  = cor do campeonato na tela
// usual  = canais que costumam ter os direitos no Brasil; mostrados como "(provável)"
//          quando o site de canais não lista o jogo
export const LEAGUES = [
  { key: 'bra', name: 'Brasileirão', espn: 'bra.1', fd: 'BSA', color: '#22c55e',
    // A ESPN não manda as zonas do Brasileirão: estas são as regras da CBF/CONMEBOL.
    zones: [
      { from: 1, to: 4, text: 'Libertadores (fase de grupos)', color: '#16a34a' },
      { from: 5, to: 6, text: 'Pré-Libertadores', color: '#86efac' },
      { from: 7, to: 12, text: 'Copa Sul-Americana', color: '#3b82f6' },
      { from: 17, to: 20, text: 'Rebaixamento', color: '#ef4444' },
    ],
    zonesNote: 'As vagas podem descer uma posição: se o campeão da Copa do Brasil ou da Libertadores já estiver classificado pela tabela, a vaga passa para o seguinte.' },
  { key: 'brb', name: 'Brasileirão Série B', espn: 'bra.2', fd: null, color: '#a3e635',
    zones: [
      { from: 1, to: 4, text: 'Acesso à Série A', color: '#16a34a' },
      { from: 17, to: 20, text: 'Rebaixamento para a Série C', color: '#ef4444' },
    ] },
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
  { key: 'rec', name: 'Recopa Sul-Americana', espn: 'conmebol.recopa', fd: null, color: '#0d9488' },
  { key: 'cdb', name: 'Copa do Brasil', espn: 'bra.copa_do_brazil', fd: null, color: '#84cc16' },
  { key: 'pau', name: 'Paulistão', espn: 'bra.camp.paulista', fd: null, color: '#e11d48' },
  { key: 'car', name: 'Campeonato Carioca', espn: 'bra.camp.carioca', fd: null, color: '#f43f5e' },
  { key: 'min', name: 'Campeonato Mineiro', espn: 'bra.camp.mineiro', fd: null, color: '#be123c' },
  { key: 'gau', name: 'Campeonato Gaúcho', espn: 'bra.camp.gaucho', fd: null, color: '#9f1239' },
  { key: 'tpt', name: 'Taça de Portugal', espn: 'por.taca.portugal', fd: null, color: '#059669' },
  { key: 'cdr', name: 'Copa do Rei (Espanha)', espn: 'esp.copa_del_rey', fd: null, color: '#fb923c' },
  { key: 'fac', name: 'FA Cup (Inglaterra)', espn: 'eng.fa', fd: null, color: '#c084fc' },
  { key: 'cit', name: 'Taça de Itália', espn: 'ita.coppa_italia', fd: null, color: '#22d3ee' },
  { key: 'dfb', name: 'Taça da Alemanha', espn: 'ger.dfb_pokal', fd: null, color: '#f87171' },
  { key: 'cfr', name: 'Taça de França', espn: 'fra.coupe_de_france', fd: null, color: '#818cf8' },
  { key: 'unl', name: 'Liga das Nações (UEFA)', espn: 'uefa.nations', national: true, fd: null, color: '#8b5cf6' },
  { key: 'eli', name: 'Eliminatórias (América do Sul)', espn: 'fifa.worldq.conmebol', national: true, fd: null, color: '#facc15' },
  { key: 'cam', name: 'Copa América', espn: 'conmebol.america', national: true, fd: null, color: '#0ea5e9' },
  { key: 'wc', name: 'Copa do Mundo', espn: 'fifa.world', national: true, fd: 'WC', color: '#d946ef' },
  { key: 'ami', name: 'Amistosos de seleções', espn: 'fifa.friendly', national: true, fd: null, filter: 'conmebol', color: '#ec4899' },
  { key: 'ksa', name: 'Liga Saudita', espn: 'ksa.1', fd: null, color: '#15803d' },
  { key: 'mls', name: 'MLS (EUA)', espn: 'usa.1', fd: null, color: '#64748b' },
  { key: 'arg', name: 'Campeonato Argentino', espn: 'arg.1', fd: null, color: '#38bdf8', usual: ['ESPN', 'Disney+'],
    zones: [{ from: 1, to: 8, text: 'Playoffs (oitavas de final)', color: '#16a34a' }],
    zonesNote: 'Na Argentina, as vagas para a Libertadores, a Sul-Americana e o rebaixamento contam pela tabela anual (soma do ano), que a ESPN não fornece.' },
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
