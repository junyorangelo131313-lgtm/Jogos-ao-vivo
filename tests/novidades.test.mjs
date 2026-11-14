import { test } from 'node:test';
import assert from 'node:assert/strict';

// favorites.js usa localStorage: simulamos um vazio.
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); } };

const favorites = await import('../www/js/favorites.js');
const { buildNotifications, notifId } = await import('../www/js/notify.js');
const { parseSummary } = await import('../www/js/detalhes.js');

const M = (id, home, away, start, state = 'pre', extra = {}) => ({ id, league: 'bra', start, state, home, away, channels: [], ...extra });

test('favoritos: Santos por defeito, seguir e deixar de seguir', () => {
  favorites._set([{ id: null, name: 'Santos' }]);
  assert.ok(favorites.isFavTeam({ name: 'Santos' }));
  assert.ok(favorites.isFavTeam({ name: 'Santos FC' }));
  assert.ok(!favorites.isFavTeam({ name: 'Palmeiras' }));
  assert.equal(favorites.toggle({ id: '2029', name: 'Palmeiras' }), true);
  assert.ok(favorites.isFavMatch(M('1', { id: '2029', name: 'Palmeiras' }, { name: 'Remo' }, '2026-11-07T20:00:00Z')));
  // Pelo código da ESPN, mesmo com outro nome
  assert.ok(favorites.isFavTeam({ id: '2029', name: 'SE Palmeiras' }));
  assert.equal(favorites.toggle({ id: '2029', name: 'Palmeiras' }), false);
  assert.ok(!favorites.isFavTeam({ id: '2029', name: 'Palmeiras' }));
  assert.ok(favorites.isFavName('Santos'));
});

test('favoritos: aprende o código da ESPN pelo nome', () => {
  favorites._set([{ id: null, name: 'Santos' }]);
  favorites.learnIds([M('1', { id: '2674', name: 'Santos' }, { id: '1', name: 'X' }, '2026-11-07T20:00:00Z')]);
  assert.equal(favorites.all()[0].id, '2674');
  // Com o código guardado, "Santos Laguna" (outro código) já não conta
  assert.ok(!favorites.isFavTeam({ id: '999', name: 'Santos Laguna' }));
});

test('avisos: 30 min antes, só favoritos e só jogos futuros', () => {
  favorites._set([{ id: null, name: 'Santos' }]);
  const now = Date.parse('2026-11-07T12:00:00Z');
  const ms = [
    M('espn:1', { name: 'Santos' }, { name: 'Palmeiras' }, '2026-11-07T20:00:00Z', 'pre', { channels: ['Premiere'] }),
    M('espn:2', { name: 'Flamengo' }, { name: 'Vasco' }, '2026-11-07T21:00:00Z'),
    M('espn:3', { name: 'Grêmio' }, { name: 'Santos' }, '2026-11-07T12:10:00Z'), // aviso já passou
    M('espn:4', { name: 'Santos' }, { name: 'Bahia' }, '2026-11-06T20:00:00Z', 'done'),
  ];
  const ns = buildNotifications(ms, {
    isFav: favorites.isFavMatch, leagueName: () => 'Brasileirão', channelText: (m) => m.channels.join(' · ') || 'canal a confirmar', now,
  });
  assert.equal(ns.length, 1);
  assert.equal(ns[0].schedule.at, '2026-11-07T19:30:00.000Z');
  assert.equal(ns[0].title, '★ Santos x Palmeiras às 20:00');
  assert.match(ns[0].body, /Brasileirão · Premiere · começa daqui a 30 min/);
  assert.equal(ns[0].id, notifId('espn:1'));
  assert.ok(Number.isInteger(ns[0].id) && ns[0].id > 0 && ns[0].id < 2 ** 31);
});

// Extrato real do "summary" da ESPN (Palmeiras 6 x 0 Remo, 05/11/2026), reduzido.
const summary = {
  header: { competitions: [{
    competitors: [
      { homeAway: 'home', score: '6', team: { id: '2029', displayName: 'Palmeiras' } },
      { homeAway: 'away', score: '0', team: { id: '4936', displayName: 'Remo' } },
    ],
    status: { type: { state: 'post', shortDetail: 'F' } },
  }] },
  keyEvents: [
    { type: { type: 'kickoff' }, clock: { value: 0, displayValue: "0'" } },
    { type: { type: 'goal', text: 'Gol' }, clock: { value: 186, displayValue: "4'" }, team: { id: '2029' },
      participants: [{ athlete: { displayName: 'Jhon Arias' } }, { athlete: { displayName: 'Vitor Roque' } }] },
    { type: { type: 'own-goal', text: 'Gol contra' }, clock: { value: 2120, displayValue: "36'" }, team: { id: '2029' },
      participants: [{ athlete: { displayName: 'Marcelinho' } }] },
    { type: { type: 'yellow-card' }, clock: { value: 3000, displayValue: "50'" }, team: { id: '4936' },
      participants: [{ athlete: { displayName: 'Jogador Remo' } }] },
    { type: { type: 'substitution' }, clock: { value: 3100, displayValue: "52'" }, team: { id: '4936' } },
    { type: { type: 'penalty---scored' }, clock: { value: 1000, displayValue: "17'" }, team: { id: '2029' },
      participants: [{ athlete: { displayName: 'Flaco López' } }] },
  ],
  boxscore: { teams: [
    { team: { id: '2029' }, statistics: [{ name: 'possessionPct', displayValue: '57.8' }, { name: 'totalShots', displayValue: '19' }] },
    { team: { id: '4936' }, statistics: [{ name: 'possessionPct', displayValue: '42.2' }, { name: 'totalShots', displayValue: '5' }] },
  ] },
  gameInfo: { venue: { fullName: 'Allianz Parque', address: { city: 'São Paulo' } }, attendance: 0 },
};

test('detalhes: golos, pénalti, golo contra, cartões e estatísticas', () => {
  const d = parseSummary(summary);
  assert.deepEqual(d.events.map((e) => [e.minute, e.kind, e.side, e.player]), [
    ["4'", 'goal', 'home', 'Jhon Arias'],
    ["17'", 'pen', 'home', 'Flaco López'],
    ["36'", 'own', 'home', 'Marcelinho'],
    ["50'", 'yellow', 'away', 'Jogador Remo'],
  ]);
  assert.equal(d.events[0].assist, 'Vitor Roque');
  assert.equal(d.events[2].assist, '');
  assert.deepEqual(d.stats, [
    { label: 'Posse de bola (%)', home: '57.8', away: '42.2' },
    { label: 'Remates', home: '19', away: '5' },
  ]);
  assert.equal(d.venue, 'Allianz Parque, São Paulo');
  assert.deepEqual(d.score, { home: 6, away: 0 });
  assert.equal(d.status, 'post');
});

test('detalhes: resposta vazia não rebenta', () => {
  const d = parseSummary({});
  assert.deepEqual(d.events, []);
  assert.deepEqual(d.stats, []);
  assert.equal(d.score, null);
});

const { parseGoals } = await import('../www/js/sources/espn.js');
const { goalLines } = await import('../www/js/logic.js');

test('golos na lista: lê os "details" da ESPN e agrupa por jogador', () => {
  // Extrato real (Palmeiras x Remo, 05/11/2026)
  const details = [
    { type: { text: 'Gol' }, clock: { value: 186, displayValue: "4'" }, team: { id: '2029' }, scoringPlay: true, ownGoal: false, penaltyKick: false, shootout: false, athletesInvolved: [{ displayName: 'Jhon Arias', shortName: 'J. Arias' }] },
    { type: { text: 'Cartão amarelo' }, clock: { value: 500, displayValue: "9'" }, team: { id: '4936' }, scoringPlay: false, yellowCard: true, athletesInvolved: [{ shortName: 'X' }] },
    { type: { text: 'Gol' }, clock: { value: 794, displayValue: "14'" }, team: { id: '2029' }, scoringPlay: true, athletesInvolved: [{ shortName: 'J. Arias' }] },
    { type: { text: 'Gol contra' }, clock: { value: 2120, displayValue: "36'" }, team: { id: '2029' }, scoringPlay: true, ownGoal: true, athletesInvolved: [{ shortName: 'Marcelinho' }] },
    { type: { text: 'Gol de pênalti' }, clock: { value: 4000, displayValue: "67'" }, team: { id: '4936' }, scoringPlay: true, penaltyKick: true, athletesInvolved: [{ shortName: 'Pedro Rocha' }] },
  ];
  const gs = parseGoals(details, '2029', '4936');
  assert.equal(gs.length, 4);
  assert.deepEqual(goalLines(gs, 'home'), [
    { player: 'J. Arias', marks: "4', 14'" },
    { player: 'Marcelinho (contra)', marks: "36'" },
  ]);
  assert.deepEqual(goalLines(gs, 'away'), [{ player: 'Pedro Rocha', marks: "67' (pên.)" }]);
  assert.deepEqual(parseGoals(undefined, '1', '2'), []);
});

test('golos: a lista da ESPN guarda-os no jogo e a atualização ao vivo também', async () => {
  const { parseEspn } = await import('../www/js/sources/espn.js');
  const { mergeLive } = await import('../www/js/logic.js');
  const data = { events: [{ id: '7', date: '2026-11-06T20:00Z', status: { type: { state: 'in', shortDetail: "52'" } },
    competitions: [{ competitors: [
      { homeAway: 'home', score: '1', team: { id: '10', displayName: 'Santos' } },
      { homeAway: 'away', score: '0', team: { id: '20', displayName: 'Palmeiras' } }],
    details: [{ scoringPlay: true, clock: { value: 600, displayValue: "10'" }, team: { id: '10' }, athletesInvolved: [{ shortName: 'Neymar' }] }] }] }] };
  const [m] = parseEspn(data, { key: 'bra' });
  assert.deepEqual(m.goals, [{ side: 'home', player: 'Neymar', minute: "10'", kind: 'goal' }]);
  const merged = mergeLive([{ ...m, goals: [], channels: ['Premiere'] }], [m]);
  assert.equal(merged[0].goals.length, 1);
  assert.deepEqual(merged[0].channels, ['Premiere']);
});

const standings = await import('../www/js/standings.js');
const { LEAGUES } = await import('../www/js/leagues.js');

test('zonas do Brasileirão: Libertadores, Pré-Libertadores, Sul-Americana e rebaixamento', () => {
  const bra = LEAGUES.find((l) => l.key === 'bra');
  const rules = standings.zoneRules({ rows: [] }, bra);
  const at = (p) => standings.zoneAt(rules, p)?.text || null;
  assert.equal(at(1), 'Libertadores (fase de grupos)');
  assert.equal(at(4), 'Libertadores (fase de grupos)');
  assert.equal(at(5), 'Pré-Libertadores');
  assert.equal(at(6), 'Pré-Libertadores');
  assert.equal(at(7), 'Copa Sul-Americana');
  assert.equal(at(12), 'Copa Sul-Americana');
  assert.equal(at(13), null);
  assert.equal(at(16), null);
  assert.equal(at(17), 'Rebaixamento');
  assert.equal(at(20), 'Rebaixamento');
  assert.equal(standings.zoneRange(rules[0]), '1.º–4.º');
});

test('zonas da ESPN (Premier League real): agrupadas por posição e traduzidas', () => {
  // Formato real da ESPN (07/11/2026): cada linha tem "note" com cor e descrição em inglês.
  const data = { children: [{ name: 'Premier', standings: { entries: Array.from({ length: 20 }, (_, i) => ({
    team: { id: String(i), displayName: `Equipa ${i + 1}` },
    stats: [{ name: 'rank', value: i + 1 }, { name: 'points', value: 40 - i }],
    note: i < 4 ? { color: '#81D6AC', description: 'Champions League' } : i === 4 ? { color: '#B5E7CE', description: 'Europa League' }
      : i >= 17 ? { color: '#FF7F84', description: 'Relegation' } : undefined,
  })) } }] };
  const [g] = standings.parseStandings(data);
  const rules = standings.zoneRules(g, { key: 'eng' });
  assert.deepEqual(rules.map((z) => [z.from, z.to, z.text]), [
    [1, 4, 'Champions League'], [5, 5, 'Liga Europa'], [18, 20, 'Rebaixamento'],
  ]);
  // Na tabela ao vivo a cor segue a posição: quem está agora em 4.º é "Champions".
  assert.equal(standings.zoneAt(rules, 4).text, 'Champions League');
  assert.equal(standings.zoneAt(rules, 6), null);
});

const espnhost = await import('../www/js/espnhost.js');

test('épocas: lê o calendário da ESPN e evita pedidos fora de época', () => {
  // Formato real (Paulistão, 10/11/2026): calendário de 10/01 a 08/03.
  const data = { leagues: [{ season: { year: 2026 }, calendar: [{ startDate: '2026-01-10T08:00Z' }, { endDate: '2026-03-08T08:00Z' }] }] };
  assert.deepEqual(espnhost.seasonOf(data), { start: '2026-01-10', end: '2026-03-08' });
  assert.equal(espnhost.seasonOf({}), null);
  const win = { start: '2026-01-10', end: '2026-03-08' };
  assert.equal(espnhost.outOfSeason(win, '2026-11-08', '2026-11-24'), true);
  assert.equal(espnhost.outOfSeason(win, '2026-01-05', '2026-01-20'), false); // apanha o início
  assert.equal(espnhost.outOfSeason(win, '2026-03-10', '2026-03-20'), false); // folga de 3 dias no fim
  const now = Date.parse('2026-11-10T10:00:00Z');
  espnhost._setSeasons({ pau: { ...win, at: now - 60 * 60 * 1000 }, old: { ...win, at: now - 5 * 24 * 3600e3 } });
  assert.equal(espnhost.seasonPlan('pau', '2026-11-08', '2026-11-24', now), 'skip');
  assert.equal(espnhost.seasonPlan('old', '2026-11-08', '2026-11-24', now), 'probe');
  assert.equal(espnhost.seasonPlan('bra', '2026-11-08', '2026-11-24', now), 'full');
  espnhost._setSeasons({});
});

test('escudo, sigla e estádio vêm da lista da ESPN', async () => {
  const { parseEspn } = await import('../www/js/sources/espn.js');
  const [m] = parseEspn({ events: [{ id: '9', date: '2026-11-13T20:00Z', status: { type: { state: 'pre' } },
    competitions: [{ venue: { fullName: 'Vila Belmiro' }, competitors: [
      { homeAway: 'home', team: { id: '1', displayName: 'Santos', abbreviation: 'SAN', logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/2674.png' } },
      { homeAway: 'away', team: { id: '2', displayName: 'Palmeiras', abbreviation: 'PAL', logos: [{ href: 'https://x/pal.png' }] } }] }] }] }, { key: 'bra' });
  assert.equal(m.home.abbr, 'SAN');
  assert.equal(m.home.logo, 'https://a.espncdn.com/i/teamlogos/soccer/500/2674.png');
  assert.equal(m.away.logo, 'https://x/pal.png');
  assert.equal(m.venue, 'Vila Belmiro');
});

test('escudo: endereços alternativos (padrão da ESPN e bandeira das seleções)', async () => {
  const { crestUrls } = await import('../www/js/logic.js');
  assert.deepEqual(crestUrls({ id: '2674', logo: '' }), ['https://a.espncdn.com/i/teamlogos/soccer/500/2674.png']);
  assert.deepEqual(crestUrls({ id: '205', abbr: 'BRA' }, true), [
    'https://a.espncdn.com/i/teamlogos/countries/500/bra.png', 'https://a.espncdn.com/i/teamlogos/soccer/500/205.png']);
  assert.deepEqual(crestUrls({ id: '1', logo: 'https://x/a.png' }), ['https://x/a.png', 'https://a.espncdn.com/i/teamlogos/soccer/500/1.png']);
  assert.deepEqual(crestUrls({ name: 'Sem dados' }), []);
});

test('competição aberta/fechada: a escolha da pessoa manda; senão, poucos jogos abre', async () => {
  const { leagueOpen } = await import('../www/js/logic.js');
  assert.equal(leagueOpen(undefined, 3, false), true);    // poucos jogos: aberta
  assert.equal(leagueOpen(undefined, 89, false), false);  // Taça de França com 89 jogos: fechada
  assert.equal(leagueOpen(undefined, 89, true), true);    // mas abre se houver jogo ao vivo / do Santos
  assert.equal(leagueOpen(false, 2, true), false);        // a pessoa fechou: fica fechada
  assert.equal(leagueOpen(true, 89, false), true);        // a pessoa abriu: fica aberta
});
