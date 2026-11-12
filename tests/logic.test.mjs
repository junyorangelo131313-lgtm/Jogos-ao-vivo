import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, hhmm, addDays, todayTomorrow, TZ_BR } from '../www/js/time.js';
import { parseEspn } from '../www/js/sources/espn.js';
import { parseFootballData } from '../www/js/sources/footballdata.js';
import { normalize, teamScore, findChannels, bestBlock } from '../www/js/channels.js';
import { isLiveish, isSantos, mergeLive, nextLiveDelay, leaguesByKickoff } from '../www/js/logic.js';
import { LEAGUES } from '../www/js/leagues.js';

test('horário de Portugal com horário de verão automático', () => {
  // Inverno: Lisboa = UTC
  assert.equal(hhmm(new Date('2026-11-04T20:00:00Z')), '20:00');
  // Verão: Lisboa = UTC+1
  assert.equal(hhmm(new Date('2026-07-04T20:00:00Z')), '21:00');
  // Brasília = UTC-3
  assert.equal(hhmm(new Date('2026-11-04T20:00:00Z'), TZ_BR), '17:00');
  // Jogo às 23:30 UTC no verão já é o dia seguinte em Lisboa
  assert.equal(dayKey(new Date('2026-07-04T23:30:00Z')), '2026-07-05');
});

test('hoje/amanhã e somar dias atravessando mudança de hora', () => {
  assert.equal(addDays('2026-10-25', 1), '2026-10-26');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.deepEqual(todayTomorrow(new Date('2026-10-25T10:00:00Z')), { today: '2026-10-25', tomorrow: '2026-10-26' });
});

const espnSample = {
  events: [
    {
      id: '1', date: '2026-11-04T22:30Z',
      status: { displayClock: "67'", type: { state: 'in', name: 'STATUS_SECOND_HALF', shortDetail: "67'" } },
      competitions: [{ competitors: [
        { homeAway: 'home', score: '2', team: { displayName: 'Santos', shortDisplayName: 'Santos' } },
        { homeAway: 'away', score: '1', team: { displayName: 'Palmeiras', shortDisplayName: 'Palmeiras' } },
      ] }],
    },
    {
      id: '2', date: '2026-11-05T20:00Z',
      status: { type: { state: 'pre', name: 'STATUS_POSTPONED' } },
      competitions: [{ competitors: [
        { homeAway: 'home', team: { displayName: 'Flamengo' } },
        { homeAway: 'away', team: { displayName: 'Vasco da Gama' } },
      ] }],
    },
  ],
};

test('lê os dados da ESPN', () => {
  const ms = parseEspn(espnSample, LEAGUES[0]);
  assert.equal(ms.length, 2);
  assert.deepEqual(ms[0].score, { home: 2, away: 1 });
  assert.equal(ms[0].state, 'live');
  assert.equal(ms[0].minute, "67'");
  assert.equal(ms[1].state, 'off');
  assert.equal(ms[1].score, null);
  assert.ok(isSantos(ms[0]));
  assert.ok(!isSantos(ms[1]));
});

test('lê os dados do football-data.org', () => {
  const ms = parseFootballData({ matches: [
    { id: 9, utcDate: '2026-11-04T20:00:00Z', status: 'PAUSED', competition: { code: 'PL' },
      homeTeam: { name: 'Arsenal FC', shortName: 'Arsenal' }, awayTeam: { name: 'Chelsea FC', shortName: 'Chelsea' },
      score: { fullTime: { home: 1, away: 0 } } },
    { id: 10, utcDate: '2026-11-04T20:00:00Z', status: 'TIMED', competition: { code: 'ELC' },
      homeTeam: {}, awayTeam: {}, score: {} },
  ] });
  assert.equal(ms.length, 1);
  assert.equal(ms[0].league, 'eng');
  assert.equal(ms[0].minute, 'Intervalo');
  assert.deepEqual(ms[0].score, { home: 1, away: 0 });
});

test('encontra os canais do jogo certo', () => {
  const block = (raw) => ({ raw, text: normalize(raw) });
  const blocks = [
    block('Brasileirão 19:30 Santos x Palmeiras Premiere SporTV'),
    block('Brasileirão 21:30 Flamengo x Vasco Globo Premiere'),
    block('Alemão 17:30 Bayern de Munique x Borussia Dortmund ESPN 4 Disney+'),
    block('Italiano 16:45 Inter de Milão x Milan ESPN'),
  ];
  const santos = { start: '2026-11-04T22:30:00Z', home: { name: 'Santos' }, away: { name: 'Palmeiras' } };
  assert.deepEqual(findChannels(bestBlock(santos, blocks).text), ['SporTV', 'Premiere']);

  const bayern = { start: '2026-11-04T20:30:00Z', home: { name: 'Bayern Munich' }, away: { name: 'Borussia Dortmund' } };
  assert.deepEqual(findChannels(bestBlock(bayern, blocks).text), ['ESPN 4', 'Disney+']);

  const vasco = { start: '2026-11-05T00:30:00Z', home: { name: 'Flamengo' }, away: { name: 'Vasco da Gama' } };
  assert.deepEqual(findChannels(bestBlock(vasco, blocks).text), ['Globo', 'Premiere']);

  const derby = { start: '2026-11-04T19:45:00Z', home: { name: 'Inter Milan' }, away: { name: 'AC Milan' } };
  assert.deepEqual(findChannels(bestBlock(derby, blocks).text), ['ESPN']);

  const none = { start: '2026-11-04T18:00:00Z', home: { name: 'Corinthians' }, away: { name: 'Grêmio' } };
  assert.equal(bestBlock(none, blocks), null);
});

test('nomes parecidos não se confundem', () => {
  const t = normalize('Real Madrid x Getafe');
  assert.equal(teamScore({ name: 'Real Madrid' }, t), 1);
  assert.equal(teamScore({ name: 'Atlético Madrid' }, t) < 1, true);
});

test('ao vivo: deteta jogos a decorrer e agenda a próxima atualização', () => {
  const now = Date.parse('2026-11-04T21:00:00Z');
  const pre = { id: 'a', state: 'pre', start: '2026-11-04T20:30:00Z', home: { name: 'A' }, away: { name: 'B' } };
  const later = { id: 'b', state: 'pre', start: '2026-11-04T23:00:00Z', home: { name: 'C' }, away: { name: 'D' } };
  assert.ok(isLiveish(pre, now));
  assert.ok(!isLiveish(later, now));
  // Há jogo ao vivo e a última atualização foi há 4 min -> faltam 6 min
  assert.equal(nextLiveDelay([pre, later], now - 4 * 60e3, 10 * 60e3, now), 6 * 60e3);
  // Só jogos futuros -> acorda 2 min depois do início
  assert.equal(nextLiveDelay([later], 0, 10 * 60e3, now), 2 * 3600e3 + 2 * 60e3);
  assert.equal(nextLiveDelay([{ ...pre, state: 'done' }], 0, 10 * 60e3, now), null);
});

test('atualização ao vivo mantém os canais', () => {
  const old = [{ id: 'x', state: 'pre', score: null, minute: '', channels: ['Globo'] }];
  const merged = mergeLive(old, [{ id: 'x', state: 'live', score: { home: 1, away: 0 }, minute: "12'" }]);
  assert.deepEqual(merged[0], { id: 'x', state: 'live', score: { home: 1, away: 0 }, minute: "12'", goals: [], channels: ['Globo'] });
});

test('calendário: dias seguidos e dia da semana', async () => {
  const { calendarDays } = await import('../www/js/logic.js');
  const { weekday } = await import('../www/js/time.js');
  const days = calendarDays('2026-11-04', 14);
  assert.equal(days.length, 14);
  assert.equal(days[0], '2026-11-04');
  assert.equal(days[13], '2026-11-17');
  assert.equal(weekday('2026-11-04'), 'Qua');
  assert.equal(weekday('2026-11-08'), 'Dom');
});

test('respostas da internet: aceita texto JSON ou objeto já lido', async () => {
  const { parseJsonBody } = await import('../www/js/http.js');
  assert.deepEqual(parseJsonBody('{"events":[]}'), { events: [] });
  assert.deepEqual(parseJsonBody({ events: [1] }), { events: [1] });
  assert.throws(() => parseJsonBody(''), /vazia/);
  assert.throws(() => parseJsonBody('<html>'), /inválida/);
});

test('URL da ESPN cobre o período do calendário', async () => {
  const { espnUrl } = await import('../www/js/sources/espn.js');
  const u = espnUrl(LEAGUES[0], '2026-11-03', '2026-11-18');
  assert.match(u, /bra\.1\/scoreboard\?dates=20261103-20261118/);
  assert.match(u, /lang=pt/);
  assert.doesNotMatch(espnUrl(LEAGUES[0], '2026-11-03', '2026-11-18', false), /lang=/);
});

test('ESPN: URL de um dia e lista de dias do período', async () => {
  const { espnUrl, daysBetween } = await import('../www/js/sources/espn.js');
  assert.match(espnUrl(LEAGUES.find((l) => l.key === 'eng'), '2026-11-04'), /eng\.1\/scoreboard\?dates=20261104&/);
  const days = daysBetween('2026-11-03', '2026-11-18');
  assert.equal(days.length, 16);
  assert.equal(days.at(-1), '2026-11-18');
});

test('amistosos: só jogos com seleções da América do Sul', async () => {
  const { keepMatch, leagueByKey } = await import('../www/js/leagues.js');
  const ami = leagueByKey('ami');
  const m = (h, a) => ({ home: { name: h, alt: [] }, away: { name: a, alt: [] } });
  assert.ok(keepMatch(ami, m('Brasil', 'Japão')));
  assert.ok(keepMatch(ami, m('França', 'Colômbia')));
  assert.ok(!keepMatch(ami, m('Índia', 'Nova Zelândia')));
  assert.ok(keepMatch(leagueByKey('eng'), m('Arsenal', 'Chelsea')));
});

test('lista de competições tem as ligas europeias e as de seleções', () => {
  const codes = LEAGUES.map((l) => l.espn);
  for (const c of ['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'por.1', 'uefa.champions', 'uefa.nations', 'fifa.worldq.conmebol', 'bra.1']) {
    assert.ok(codes.includes(c), c);
  }
  assert.equal(new Set(LEAGUES.map((l) => l.key)).size, LEAGUES.length);
});

test('resultados: pede o placar final de jogos que já acabaram', async () => {
  const { needsResult } = await import('../www/js/logic.js');
  const m = { state: 'pre', start: '2026-11-04T18:00:00Z' };
  const now = Date.parse('2026-11-04T21:00:00Z');
  assert.ok(needsResult(m, now, Date.parse('2026-11-04T17:00:00Z')));   // última atualização antes do jogo
  assert.ok(!needsResult(m, now, Date.parse('2026-11-04T20:00:00Z')));  // já atualizado depois do fim
  assert.ok(!needsResult({ ...m, state: 'done' }, now, 0));
  assert.ok(!needsResult(m, Date.parse('2026-11-04T19:00:00Z'), 0));   // ainda a decorrer
});

test('aviso de versão nova', async () => {
  const { shouldOffer } = await import('../www/js/update.js');
  assert.ok(shouldOffer(20, 17, undefined));
  assert.ok(!shouldOffer(17, 17, undefined));   // já é a mais recente
  assert.ok(!shouldOffer(20, 17, 20));          // utilizador tocou em "Depois" nesta versão
  assert.ok(shouldOffer(21, 17, 20));           // saiu outra mais nova: volta a avisar
  assert.ok(!shouldOffer(20, 0, undefined));    // sem versão (testes no navegador)
});

test('classificação: lê a tabela da ESPN', async () => {
  const { parseStandings } = await import('../www/js/standings.js');
  const st = (o) => Object.entries(o).map(([name, value]) => ({ name, value }));
  const g = parseStandings({ children: [{ name: 'Group A1', standings: { entries: [
    { team: { displayName: 'Itália' }, stats: st({ rank: 2, gamesPlayed: 4, wins: 2, ties: 1, losses: 1, pointsFor: 8, pointsAgainst: 5, pointDifferential: 3, points: 7 }),
      note: { color: '#B5E7CE', description: 'A: Qualifies for QFs' } },
    { team: { displayName: 'França' }, stats: st({ rank: 1, gamesPlayed: 4, points: 10 }) },
  ] } }] });
  assert.equal(g.length, 1);
  assert.equal(g[0].name, 'Grupo A1');
  assert.equal(g[0].rows[0].team, 'França');           // ordenado pela posição
  assert.equal(g[0].rows[1].points, 7);
  assert.equal(g[0].rows[1].gd, 3);
  assert.equal(g[0].rows[1].zone.text, 'A: Quartas de final');
  assert.deepEqual(parseStandings({ name: 'Copa', seasons: [] }), []); // taça sem tabela
});

test('tabela ao vivo: soma o placar a decorrer e mostra quem sobe/desce', async () => {
  const { liveTable } = await import('../www/js/standings.js');
  const row = (rank, id, team, points, gd) => ({ rank, id, team, points, gd, gf: 20, ga: 20, played: 10, wins: 5, draws: 2, losses: 3 });
  const groups = [{ name: '', rows: [row(1, '1', 'A', 20, 5), row(2, '2', 'B', 19, 3), row(3, '3', 'Santos', 18, 1), row(4, '4', 'D', 10, -9)] }];
  const live = [{ home: { id: '3', name: 'Santos' }, away: { id: '1', name: 'A' }, score: { home: 2, away: 0 }, minute: "70'" }];
  const [g] = liveTable(groups, live);
  assert.ok(g.live);
  assert.deepEqual(g.rows.map((r) => r.team), ['Santos', 'A', 'B', 'D']);
  const santos = g.rows[0];
  assert.equal(santos.points, 21);
  assert.equal(santos.delta, 2);          // ▲2
  assert.equal(santos.live.result, 'win');
  assert.equal(g.rows[1].delta, -1);      // A ▼1
  assert.equal(g.rows[1].live.result, 'loss');
  assert.equal(g.rows[3].delta, 0);
  // sem jogos a decorrer: tabela igual à oficial
  assert.ok(!liveTable(groups, [])[0].live);
});

test('campeonatos do dia por ordem de horário do primeiro jogo', () => {
  const ligas = [{ key: 'bra.2' }, { key: 'fra.cup' }, { key: 'eng.1' }, { key: 'esp.1' }];
  const jogos = [
    { league: 'bra.2', start: '2026-11-12T22:00:00Z' },
    { league: 'fra.cup', start: '2026-11-12T20:00:00Z' },
    { league: 'fra.cup', start: '2026-11-12T18:00:00Z' },
    { league: 'eng.1', start: '2026-11-12T22:00:00Z' },
  ];
  // Taça da França (18:00) antes da Série B (22:00); empate às 22:00 mantém a ordem da lista; sem jogos fica de fora
  assert.deepEqual(leaguesByKickoff(jogos, ligas).map((l) => l.key), ['fra.cup', 'bra.2', 'eng.1']);
});
