import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, hhmm, addDays, todayTomorrow, TZ_BR } from '../www/js/time.js';
import { parseEspn } from '../www/js/sources/espn.js';
import { parseFootballData } from '../www/js/sources/footballdata.js';
import { normalize, teamScore, findChannels, bestBlock } from '../www/js/channels.js';
import { isLiveish, isSantos, mergeLive, nextLiveDelay } from '../www/js/logic.js';
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
    { id: 10, utcDate: '2026-11-04T20:00:00Z', status: 'TIMED', competition: { code: 'CL' },
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
  assert.deepEqual(merged[0], { id: 'x', state: 'live', score: { home: 1, away: 0 }, minute: "12'", channels: ['Globo'] });
});
