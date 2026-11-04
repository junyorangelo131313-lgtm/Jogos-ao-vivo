// Campeonatos mostrados no app, na ordem em que aparecem na tela.
// espn = código na API pública da ESPN (fonte principal, sem chave)
// fd   = código no football-data.org (reserva; não tem o Argentino no plano grátis)
export const LEAGUES = [
  { key: 'bra', name: 'Brasileirão', espn: 'bra.1', fd: 'BSA' },
  { key: 'eng', name: 'Premier League', espn: 'eng.1', fd: 'PL' },
  { key: 'ger', name: 'Bundesliga', espn: 'ger.1', fd: 'BL1' },
  { key: 'ita', name: 'Campeonato Italiano', espn: 'ita.1', fd: 'SA' },
  { key: 'esp', name: 'Campeonato Espanhol', espn: 'esp.1', fd: 'PD' },
  { key: 'por', name: 'Campeonato Português', espn: 'por.1', fd: 'PPL' },
  { key: 'arg', name: 'Campeonato Argentino', espn: 'arg.1', fd: null },
];

export const leagueByKey = (key) => LEAGUES.find((l) => l.key === key);
