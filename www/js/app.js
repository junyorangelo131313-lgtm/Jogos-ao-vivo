import { LEAGUES, leagueByKey } from './leagues.js';
import { addDays, dayKey, hhmm, shortDate, todayTomorrow, weekday } from './time.js';
import { fetchEspn } from './sources/espn.js';
import { fetchFootballData } from './sources/footballdata.js';
import { fetchChannelsInfo } from './channels.js';
import { calendarDays, channelsMaxAge, channelStatus, goalLines, isLiveish, leaguesByKickoff, mergeLive, needsResult, nextLiveDelay, sortMatches } from './logic.js';
import * as favorites from './favorites.js';
import * as notify from './notify.js';
import * as detalhes from './detalhes.js';
import * as store from './store.js';
import * as filmes from './filmes.js';
import * as update from './update.js';
import * as standings from './standings.js';
const { zoneRange } = standings;

const CAL_DAYS = 14;
const COLLAPSE_OVER = 10;                  // mais jogos do que isto num dia: a competição começa fechada                       // calendário: hoje + 13 dias
const FAR_MAX_AGE = 24 * 60 * 60 * 1000;       // dias distantes do calendário: uma vez por dia
const AGENDA_MAX_AGE = 4 * 60 * 60 * 1000; // agenda: no máximo ~6 vezes por dia
const LIVE_INTERVAL = 10 * 60 * 1000;      // ao vivo: de 10 em 10 minutos
const MANUAL_MIN_GAP = 2 * 60 * 1000;      // botão "Atualizar": no máximo de 2 em 2 min
const BACK_TO_LIVE_AFTER = 20 * 60 * 1000;     // ao voltar ao app depois de 20 min: abre em "Ao vivo"
const FD_KEY = (window.APP_CONFIG && window.APP_CONFIG.footballDataKey) || '';

let state = store.load();
let busy = false;
let liveTimer = null;
let message = '';
let view = 'aovivo';       // 'aovivo' | 'resultados' | 'campeonatos' | 'calendario' | 'filmes'
let selectedLeague = null; // campeonato aberto no separador Campeonatos
let leagueTab = 'jogos';   // dentro de um campeonato: 'jogos' | 'tabela'
const tabelaBusy = new Set();
const tabelaError = {};
let filmesState = filmes.loadCache();
let filmesBusy = false;
let filmesError = '';
let selectedDay = null;    // dia escolhido no calendário
let openMatch = null;      // id do jogo aberto nos detalhes
let detailBusy = false;
let detailError = '';
let hiddenAt = 0;
const fav = (m) => favorites.isFavMatch(m);

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- Dados ---------------- */

async function loadLeagues(leagues, fromKey, toKey) {
  const results = await Promise.all(leagues.map((l) => fetchEspn(l, fromKey, toKey).then(
    (ms) => ({ l, ms }), (err) => ({ l, err }),
  )));
  let matches = results.filter((r) => r.ms).flatMap((r) => r.ms);
  let failed = results.filter((r) => r.err);
  if (failed.length && FD_KEY) {
    try {
      // O plano grátis do football-data.org aceita no máximo 10 dias por pedido.
      const withFd = failed.map((r) => r.l).filter((l) => l.fd);
      matches = matches.concat(await fetchFootballData(withFd, fromKey, minKey(toKey, addDays(fromKey, 9)), FD_KEY));
      failed = failed.filter((r) => !r.l.fd);
    } catch (e) { console.warn('football-data falhou', e); }
  }
  const errors = Object.fromEntries(failed.map((r) => [r.l.key, String(r.err?.message || r.err)]));
  return { matches, failed: failed.map((r) => r.l), errors };
}

const minKey = (a, b) => (a < b ? a : b);

async function refreshAgenda() {
  const { today, tomorrow } = todayTomorrow(new Date());
  const yesterday = addDays(today, -1);
  const lastDay = addDays(today, CAL_DAYS - 1);
  // A ESPN usa o dia dos EUA, que vai atrás do de Portugal: para ter os jogos de ontem (de Portugal)
  // é preciso pedir também o dia anterior.
  // Os dias mais distantes (daqui a 3 dias ou mais) mudam pouco: pedimos uma vez por dia.
  // Nas outras atualizações só ontem, hoje, amanhã e depois — muito menos pedidos à ESPN.
  const nearEnd = addDays(today, 2);
  const farFresh = state.farAt && Date.now() - state.farAt < FAR_MAX_AGE;
  const { matches: fresh, failed, errors } = await loadLeagues(LEAGUES, addDays(today, -2), farFresh ? nearEnd : lastDay);
  if (failed.length === LEAGUES.length) {
    const why = Object.values(errors)[0] || '';
    throw new Error(`Não foi possível ligar ao servidor dos jogos${why ? ` (${why})` : ''}.`);
  }

  // Para as ligas que falharam, mantém o que já estava guardado.
  const failedKeys = new Set(failed.map((l) => l.key));
  const kept = state.matches.filter((m) => failedKeys.has(m.league));
  const seen = new Set();
  const keptFar = farFresh ? state.matches.filter((m) => dayKey(new Date(m.start)) > nearEnd) : [];
  let matches = [...fresh, ...kept, ...keptFar]
    .filter((m) => { const d = dayKey(new Date(m.start)); return d >= yesterday && d <= lastDay; })
    .filter((m) => !seen.has(m.id) && seen.add(m.id));

  // Canais: o site só tem as páginas de hoje e de amanhã.
  const oldById = new Map(state.matches.map((m) => [m.id, m]));
  const near = matches.filter((m) => [today, tomorrow].includes(dayKey(new Date(m.start))));
  let ch = {}, chSrc = { ok1: false, ok2: false };
  try {
    const r = await fetchChannelsInfo(near);
    ch = r.map; chSrc = { ok1: r.ok1, ok2: r.ok2 };
  } catch (e) {
    console.warn('canais indisponíveis', e);
  }
  matches = matches.map((m) => ({ ...m, channels: ch[m.id] || oldById.get(m.id)?.channels || [] }));

  const missing = failed.filter((l) => !kept.some((m) => m.league === l.key)).map((l) => `${l.name} (${errors[l.key]})`);
  state = { ...state, matches, today, missing, fetchedAt: Date.now(), liveFetchedAt: Date.now(), channelsAt: Date.now(), chSrc,
    farAt: farFresh ? state.farAt : Date.now() };
  store.save(state);
  favorites.learnIds(matches);
  syncNotifications();
}

/** Jogos de hoje e amanhã, ainda por jogar, sem canal. */
const missingChannels = (now = Date.now()) => {
  const near = nearDays(now);
  return state.matches.filter((m) => m.state === 'pre' && Date.parse(m.start) > now
    && near.includes(dayKey(new Date(m.start))) && !m.channels?.length);
};

/** Volta a procurar só os canais (o site publica os jogos de amanhã ao longo do dia). */
async function refreshChannels() {
  const todo = missingChannels();
  if (!todo.length) return;
  let ch = {}, chSrc = { ok1: false, ok2: false };
  try { const r = await fetchChannelsInfo(todo); ch = r.map; chSrc = { ok1: r.ok1, ok2: r.ok2 }; } catch (e) { console.warn('canais indisponíveis', e); }
  state = {
    ...state,
    matches: state.matches.map((m) => (ch[m.id] ? { ...m, channels: ch[m.id] } : m)),
    channelsAt: Date.now(), chSrc,
  };
  store.save(state);
  if (Object.keys(ch).length) syncNotifications();
}

// Canais em falta: de 2 em 2 horas; de 15 em 15 min na última hora antes de um jogo sem canal; de 10 em 10 min se as fontes falharam.
const channelsAreOld = () => {
  const miss = missingChannels();
  return miss.length && Date.now() - (state.channelsAt || state.fetchedAt || 0) > channelsMaxAge(miss, state.chSrc);
};

let notifInfo = null; // resultado da última marcação de avisos
async function syncNotifications() {
  notifInfo = await notify.sync(state.matches, {
    isFav: fav,
    leagueName: (k) => leagueByKey(k)?.name || '',
    channelText: (m) => channelText(m),
  });
  renderSettings();
}

const pendingResults = (now = Date.now()) => state.matches.filter((m) => needsResult(m, now, state.liveFetchedAt || 0));

/** Atualiza placares: jogos a decorrer + jogos que já acabaram e ainda não têm o resultado final. */
async function refreshLive() {
  const om = openMatch && state.matches.find((m) => m.id === openMatch);
  if (om && isLiveish(om)) loadDetail(om, true);
  const now = Date.now();
  const todo = [...state.matches.filter((m) => isLiveish(m, now)), ...pendingResults(now)];
  const keys = [...new Set(todo.map((m) => m.league))];
  if (!keys.length) return;
  const { today } = todayTomorrow(new Date(now));
  const first = todo.map((m) => dayKey(new Date(m.start))).sort()[0];
  const { matches: fresh } = await loadLeagues(keys.map(leagueByKey), addDays(minKey(first, today), -1), today);
  state = { ...state, matches: mergeLive(state.matches, fresh), liveFetchedAt: Date.now() };
  store.save(state);
}

async function run(task) {
  if (busy) return;
  busy = true;
  render();
  try {
    await task();
    message = '';
  } catch (e) {
    console.warn(e);
    message = navigator.onLine === false
      ? 'Sem internet. A mostrar os dados guardados.'
      : (e?.message || 'Não foi possível atualizar.');
  } finally {
    busy = false;
    render();
    scheduleLive();
  }
}

function agendaIsOld() {
  const { today } = todayTomorrow();
  return !state.fetchedAt || state.today !== today || Date.now() - state.fetchedAt > AGENDA_MAX_AGE;
}

/* ---------------- Ao vivo (só com o app aberto) ---------------- */

function stopLive() {
  clearTimeout(liveTimer);
  liveTimer = null;
}

function scheduleLive() {
  stopLive();
  if (document.hidden) return;
  const live = nextLiveDelay(state.matches, state.liveFetchedAt || 0, LIVE_INTERVAL);
  // Com o app aberto, os canais em falta também são procurados de novo (antes só ao reabrir o app).
  const miss = missingChannels();
  const chan = miss.length ? Math.max(0, (state.channelsAt || state.fetchedAt || 0) + channelsMaxAge(miss, state.chSrc) - Date.now()) : null;
  if (live == null && chan == null) return;
  const delay = Math.min(live ?? Infinity, chan ?? Infinity);
  liveTimer = setTimeout(() => {
    run(agendaIsOld() ? refreshAgenda : channelsAreOld() ? refreshChannels : refreshLive);
  }, Math.min(delay, 2 ** 31 - 1));
}

function onOpen() {
  render();
  if (agendaIsOld()) run(refreshAgenda);
  else if (pendingResults().length) run(refreshLive); // buscar placares finais que faltam
  else if (channelsAreOld()) run(refreshChannels);
  else scheduleLive();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopLive(); hiddenAt = Date.now(); return; }
  // Depois de muito tempo fora, o app volta a abrir no separador "Ao vivo".
  if (hiddenAt && Date.now() - hiddenAt > BACK_TO_LIVE_AFTER && !openMatch) { view = 'aovivo'; selectedLeague = null; }
  onOpen();
});

/* ---------------- Tela ---------------- */

function channelText(m, showTbc = true) {
  if (m.state === 'off') return 'Adiado / cancelado';
  if (m.channels?.length) return m.channels.join(' · ');
  if (!showTbc) return '';
  const usual = leagueByKey(m.league)?.usual;
  if (usual) return `${usual.join(' · ')} (provável)`;
  // Sem canal: diz porquê (as fontes falharam, o jogo é hoje e nenhuma o lista, ou ainda é cedo).
  const st = channelStatus(m, state.chSrc, nearDays(Date.now())[0]);
  return st === 'indisponivel' ? 'canais indisponíveis agora' : st === 'sem' ? 'sem transmissão anunciada no Brasil' : 'canal a confirmar';
}

function scoreOrX(m) {
  return m.score ? `<b class="score">${m.score.home} – ${m.score.away}</b>` : '<span class="x">x</span>';
}

function teams(m) {
  return `${fav(m) ? '<span class="star">★</span>' : ''}${esc(m.home.name)} ${scoreOrX(m)} ${esc(m.away.name)}`;
}

const nearDays = (now) => { const { today, tomorrow } = todayTomorrow(new Date(now)); return [today, tomorrow]; };

function dayLabel(d, now) {
  const [today, tomorrow] = nearDays(now);
  return d === today ? 'Hoje' : d === tomorrow ? 'Amanhã' : d === addDays(today, -1) ? 'Ontem' : weekday(d);
}

function leagueTag(key) {
  const l = leagueByKey(key);
  return `<span class="tag" style="--c:${l?.color || 'var(--accent)'}">${esc(l?.name)}</span>`;
}

/** Quem marcou: coluna da casa à esquerda, visitante à direita. */
function goalsHtml(m) {
  if (!m.goals?.length || !m.score) return '';
  const col = (side) => goalLines(m.goals, side)
    .map((g) => `<span>⚽ ${esc(g.player)} <b>${esc(g.marks)}</b></span>`).join('');
  return `<div class="goals"><div class="gh">${col('home')}</div><div class="ga">${col('away')}</div></div>`;
}

function liveCard(m) {
  return `
    <div class="live-card${fav(m) ? ' santos' : ''}" data-mid="${esc(m.id)}" role="button" tabindex="0" style="--c:${leagueByKey(m.league)?.color || 'var(--accent)'}">
      <div class="live-top">${leagueTag(m.league)}<span class="minute"><span class="dot"></span>${esc(m.minute || 'A começar')}</span></div>
      <div class="teams big">${teams(m)}</div>
      ${goalsHtml(m)}
      <div class="channel">${esc(channelText(m))}</div>
    </div>`;
}

function row(m, now, { showTbc = true, showLeague = false, showDay = false } = {}) {
  const live = isLiveish(m, now);
  const time = m.state === 'done' ? 'Fim' : live ? 'AO VIVO' : hhmm(new Date(m.start));
  const ch = channelText(m, showTbc);
  const d = dayKey(new Date(m.start));
  return `
    <div class="row${fav(m) ? ' santos' : ''}${m.state === 'done' ? ' done' : ''}${live ? ' live' : ''}" data-mid="${esc(m.id)}" role="button" tabindex="0">
      <div class="time${live ? ' is-live' : ''}">${showDay && !live && m.state !== 'done' ? `<small>${esc(dayLabel(d, now))}</small>` : ''}${esc(time)}</div>
      <div class="info">
        <div class="teams">${teams(m)}</div>
        ${goalsHtml(m)}
        ${showLeague || ch ? `<div class="channel${m.channels?.length ? '' : ' tbc'}">${showLeague ? leagueTag(m.league) : ''}${esc(ch)}</div>` : ''}
      </div>
      <span class="go" aria-hidden="true">›</span>
    </div>`;
}

function leaguesOfDay(key, now, opts = {}) {
  const ofDay = state.matches.filter((m) => dayKey(new Date(m.start)) === key && (!opts.only || opts.only(m)));
  if (!ofDay.length) return `<p class="empty">${opts.emptyText || 'Sem jogos neste dia.'}</p>`;
  let html = '';
  // Por ordem de horário: primeiro o campeonato cujo jogo começa mais cedo.
  for (const l of leaguesByKickoff(ofDay, LEAGUES)) {
    const list = sortMatches(ofDay.filter((m) => m.league === l.key));
    if (!list.length) continue;
    const rows = `<div class="card">${list.map((m) => row(m, now, opts)).join('')}</div>`;
    if (opts.collapse) {
      // Competições com muitos jogos (ex.: taças com divisões baixas) ficam fechadas;
      // abrem sempre se houver jogo ao vivo ou de um time favorito.
      const open = list.length <= COLLAPSE_OVER || list.some((m) => fav(m) || isLiveish(m, now));
      html += `<details class="league" style="--c:${l.color}"${open ? ' open' : ''}>
        <summary><span class="ldot"></span>${esc(l.name)} <small>${list.length} jogo${list.length > 1 ? 's' : ''}</small></summary>${rows}</details>`;
    } else {
      html += `<section class="league" style="--c:${l.color}"><h3><span class="ldot"></span>${esc(l.name)}</h3>${rows}</section>`;
    }
  }
  return html;
}

function favBox(now) {
  const favs = favorites.all();
  const list = sortMatches(state.matches.filter((m) => fav(m) && m.state !== 'done' && m.state !== 'off')).slice(0, 4);
  const chips = favs.map((f, i) => `<button type="button" class="fav-chip" data-unfav="${i}" aria-label="Deixar de seguir ${esc(f.name)}">★ ${esc(f.name)} <span aria-hidden="true">✕</span></button>`).join('');
  return `<section class="santos-box"><h3><span class="star">★</span>Os meus times</h3>
    ${favs.length ? `<div class="fav-chips">${chips}</div>` : ''}
    ${list.map((m) => {
      const d = dayKey(new Date(m.start));
      return `<div class="santos-line" data-mid="${esc(m.id)}" role="button" tabindex="0"><b>${esc(dayLabel(d, now))} ${shortDate(d)} · ${hhmm(new Date(m.start))}</b>
        ${esc(m.home.name)} x ${esc(m.away.name)}${isLiveish(m, now) ? ' <span class="minute">AO VIVO</span>' : ''}</div>`;
    }).join('')}
    ${favs.length && !list.length ? '<p class="hint">Sem jogos dos seus times nos próximos dias.</p>' : ''}
    <p class="hint">Toque num jogo para ver os detalhes e seguir um time (★).${notify.available() && notify.enabled() ? ` Recebe um aviso ${notify.BEFORE_MIN} min antes de cada jogo.` : ''}</p>
  </section>`;
}

/* Separador 1: só os jogos ao vivo, em destaque */
function renderAoVivo(now) {
  const live = sortMatches(state.matches.filter((m) => isLiveish(m, now)));
  let html = `<h2 class="section-title live-title"><span class="dot"></span>AO VIVO
    ${live.length ? `<span class="count">${live.length}</span>` : ''}</h2>`;
  if (live.length) {
    html += `<div class="live-list" aria-live="polite">${live.map(liveCard).join('')}</div>`;
  } else {
    html += '<div class="card empty-card"><p>Nenhum jogo a decorrer agora.</p></div>';
  }
  html += favBox(now);
  // Todos os jogos de todas as competições: hoje, amanhã e os resultados de ontem.
  const [today, tomorrow] = nearDays(now);
  const yesterday = addDays(today, -1);
  html += `<h2 class="section-title">Hoje <small>${shortDate(today)}</small></h2>
    ${leaguesOfDay(today, now, { collapse: true, emptyText: 'Sem jogos hoje.' })}
    <h2 class="section-title">Amanhã <small>${shortDate(tomorrow)}</small></h2>
    ${leaguesOfDay(tomorrow, now, { collapse: true, emptyText: 'Sem jogos amanhã.' })}
    <h2 class="section-title">Ontem <small>${shortDate(yesterday)} · resultados</small></h2>
    ${leaguesOfDay(yesterday, now, { collapse: true, showTbc: false, emptyText: 'Sem jogos ontem.' })}
    <p class="note">Toque num campeonato para abrir ou fechar. Os que têm muitos jogos começam fechados.</p>`;
  return html;
}

/* Separador 2: resultados (placar final) de hoje e de ontem */
function renderResultados(now) {
  const [today] = nearDays(now);
  const yesterday = addDays(today, -1);
  const ended = (m) => m.state === 'done' || m.state === 'off';
  return `
    <h2 class="section-title">Terminados hoje <small>${shortDate(today)}</small></h2>
    ${leaguesOfDay(today, now, { only: ended, showTbc: false, emptyText: 'Ainda nenhum jogo terminou hoje.' })}
    <h2 class="section-title">Ontem <small>${shortDate(yesterday)}</small></h2>
    ${leaguesOfDay(yesterday, now, { only: ended, showTbc: false, emptyText: 'Sem resultados de ontem.' })}
    <p class="note">Os jogos de ontem aparecem depois da primeira atualização de hoje.</p>`;
}

/* Classificação de um campeonato (pedida só quando se abre) */
// Tabela oficial: guardada 6 horas; com jogos deste campeonato a decorrer ou acabados há pouco,
// volta a pedir de 15 em 15 minutos (para apanhar a tabela oficial logo que a ESPN a atualize).
function tabelaMaxAge(l, now = Date.now()) {
  const busy = state.matches.some((m) => m.league === l.key && (isLiveish(m, now)
    || (m.state === 'done' && now - Date.parse(m.start) < 4 * 60 * 60 * 1000)));
  return busy ? 15 * 60 * 1000 : 6 * 60 * 60 * 1000;
}

async function loadTabela(l, force = false) {
  if (tabelaBusy.has(l.key)) return;
  const c = standings.cached(l.key);
  if (!force && c && Date.now() - c.fetchedAt < tabelaMaxAge(l)) return;
  force = force || Boolean(c);
  tabelaBusy.add(l.key);
  delete tabelaError[l.key];
  try {
    await standings.fetchStandings(l, force);
  } catch (e) {
    console.warn('classificação', e);
    tabelaError[l.key] = 'Não foi possível carregar a classificação.';
  } finally {
    tabelaBusy.delete(l.key);
    if (view === 'campeonatos' && selectedLeague === l.key) render();
  }
}

function tabelaHtml(l) {
  loadTabela(l);
  const c = standings.cached(l.key);
  if (!c) {
    return `<div class="card empty-card"><p>${tabelaBusy.has(l.key) ? 'A carregar a classificação…' : esc(tabelaError[l.key] || 'Sem classificação.')}</p></div>`;
  }
  if (!c.groups.length) return '<div class="card empty-card"><p>Esta competição não tem tabela de classificação (é a eliminar ou ainda não começou).</p></div>';
  const now = Date.now();
  const liveMs = state.matches.filter((m) => m.league === l.key && isLiveish(m, now) && m.score);
  const groups = standings.liveTable(c.groups, liveMs);
  const legend = new Map(); // zonas para a legenda (sem repetir)
  let html = groups.some((g) => g.live)
    ? '<p class="live-note"><span class="dot"></span><span>Tabela <b>ao vivo</b>, com os placares dos jogos a decorrer. ▲▼ = lugares que sobe ou desce agora.</span></p>'
    : '';
  for (const g of groups) {
    if (groups.length > 1 && g.name) html += `<h3 class="day-sub">${esc(g.name)}</h3>`;
    const rules = standings.zoneRules(c.groups.find((x) => x.name === g.name) || g, l);
    for (const z of rules) legend.set(`${z.text}|${z.from}|${z.to}`, z);
    let prevZone = null;
    html += `<div class="card table-card"><table class="tabela">
      <thead><tr><th class="pos">#</th><th class="tm">Equipa</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th><th class="pts">Pts</th></tr></thead><tbody>
      ${g.rows.map((r, i) => {
        const z = standings.zoneAt(rules, r.liveRank);
        const border = i > 0 && z !== prevZone ? ' zb' : '';
        prevZone = z;
        const santos = favorites.isFavName(r.team);
        const gd = r.gd === null ? '' : r.gd > 0 ? `+${r.gd}` : r.gd;
        const arrow = r.delta > 0 ? `<span class="mv up">▲${r.delta}</span>` : r.delta < 0 ? `<span class="mv down">▼${-r.delta}</span>` : '';
        const live = r.live ? `<span class="lv ${r.live.result}" title="${esc(r.live.minute)}">${r.live.gf}-${r.live.ga}</span>` : '';
        return `<tr class="${santos ? 'santos-row' : ''}${r.live ? ' playing' : ''}${border}"${z ? ` style="--z:${z.color}" title="${esc(z.text)}"` : ''}>
          <td class="pos"><span class="zone" style="background:${z?.color || 'transparent'}"></span>${r.liveRank}${arrow}</td>
          <td class="tm">${r.logo ? `<img src="${esc(r.logo)}" alt="" loading="lazy">` : ''}<span>${santos ? '★ ' : ''}${esc(r.team)}</span>${live}</td>
          <td>${r.played ?? ''}</td><td>${r.wins ?? ''}</td><td>${r.draws ?? ''}</td><td>${r.losses ?? ''}</td>
          <td>${gd}</td><td class="pts">${r.points ?? ''}</td></tr>`;
      }).join('')}
      </tbody></table></div>`;
  }
  if (legend.size) {
    const items = [...legend.values()].sort((a, b) => a.from - b.from)
      .map((z) => `<span><i style="background:${z.color}"></i><b>${zoneRange(z)}</b> ${esc(z.text)}</span>`).join('');
    // A legenda vai para o topo, antes da tabela, para se perceber logo as cores.
    const first = html.indexOf('<div class="card table-card">') >= 0 ? html.search(/<h3 class="day-sub">|<div class="card table-card">/) : html.length;
    html = `${html.slice(0, first)}<div class="zones top">${items}</div>${html.slice(first)}`;
  }
  if (l.zonesNote) html += `<p class="note">${esc(l.zonesNote)}</p>`;
  const when = new Date(c.fetchedAt);
  html += `<p class="note">J jogos · V vitórias · E empates · D derrotas · SG saldo de golos. Atualizada às ${hhmm(when)}.</p>`;
  return html;
}

/* Separador 3: lista de campeonatos → jogos ou classificação do campeonato escolhido */
function renderCampeonatos(now) {
  if (selectedLeague && leagueByKey(selectedLeague)) {
    const l = leagueByKey(selectedLeague);
    const list = sortMatches(state.matches.filter((m) => m.league === l.key));
    const near = nearDays(now);
    let html = `<button type="button" class="back" data-back>‹ Todos os campeonatos</button>
      <h2 class="section-title" style="--c:${l.color}"><span class="ldot big"></span>${esc(l.name)}</h2>
      <div class="seg" role="tablist">
        <button type="button" class="seg-btn" data-ltab="jogos" aria-selected="${leagueTab === 'jogos'}">Jogos</button>
        <button type="button" class="seg-btn" data-ltab="tabela" aria-selected="${leagueTab === 'tabela'}">Classificação</button>
      </div>`;
    if (leagueTab === 'tabela') return html + tabelaHtml(l);
    if (!list.length) return `${html}<div class="card empty-card"><p>Sem jogos nos próximos ${CAL_DAYS} dias.</p></div>`;
    const days = [...new Set(list.map((m) => dayKey(new Date(m.start))))];
    for (const d of days) {
      const ofDay = list.filter((m) => dayKey(new Date(m.start)) === d);
      html += `<h3 class="day-sub">${esc(dayLabel(d, now))} <small>${shortDate(d)}</small></h3>
        <div class="card">${ofDay.map((m) => row(m, now, { showTbc: near.includes(d) })).join('')}</div>`;
    }
    return html;
  }
  const cards = LEAGUES.map((l) => {
    const ms = state.matches.filter((m) => m.league === l.key);
    const live = ms.filter((m) => isLiveish(m, now)).length;
    const info = live ? `<span class="minute"><span class="dot"></span>${live} ao vivo</span>`
      : ms.length ? `${ms.length} jogo${ms.length > 1 ? 's' : ''}` : 'sem jogos';
    return `<button type="button" class="league-btn${ms.length ? '' : ' none'}" data-league="${l.key}" style="--c:${l.color}">
      <span class="ldot"></span><span class="lname">${esc(l.name)}</span><span class="linfo">${info}</span></button>`;
  }).join('');
  return `<h2 class="section-title">Campeonatos</h2><p class="hint">Toque num campeonato para ver os jogos dos próximos ${CAL_DAYS} dias.</p>
    <div class="league-grid">${cards}</div>`;
}

/* Separador 4: calendário por dia (de ontem até daqui a 13 dias) */
function renderCalendario(now) {
  const [today, tomorrow] = nearDays(now);
  const days = calendarDays(addDays(today, -1), CAL_DAYS + 1);
  if (!selectedDay || !days.includes(selectedDay)) selectedDay = today;
  const counts = new Map();
  for (const m of state.matches) {
    const d = dayKey(new Date(m.start));
    counts.set(d, (counts.get(d) || 0) + 1);
  }
  const santosDays = new Set(state.matches.filter(fav).map((m) => dayKey(new Date(m.start))));
  const chips = days.map((d) => `
    <button type="button" class="chip${d === selectedDay ? ' on' : ''}${santosDays.has(d) ? ' has-santos' : ''}" data-day="${d}">
      <span class="chip-wd">${esc(dayLabel(d, now))}</span>
      <span class="chip-date">${shortDate(d)}</span>
      <span class="chip-n">${counts.get(d) ? `${counts.get(d)} jogo${counts.get(d) > 1 ? 's' : ''}` : '—'}</span>
    </button>`).join('');
  const near = [today, tomorrow].includes(selectedDay);
  return `
    <div class="chips" role="tablist" aria-label="Escolher dia">${chips}</div>
    <h2 class="section-title">${esc(dayLabel(selectedDay, now))} <small>${shortDate(selectedDay)}</small></h2>
    ${leaguesOfDay(selectedDay, now, { showTbc: near })}
    ${near ? '' : '<p class="note">Os canais de TV aparecem na véspera do jogo.</p>'}`;
}

/* Separador 5: filmes e séries recomendados */
async function loadFilmes(force = false) {
  if (filmesBusy || (!force && !filmes.isStale(filmesState))) return;
  filmesBusy = true;
  filmesError = '';
  if (view === 'filmes') render();
  try {
    filmesState = await filmes.fetchFilmes();
  } catch (e) {
    console.warn('filmes', e);
    filmesError = /HTTP 404/.test(e.message)
      ? 'A lista de filmes ainda não foi criada no GitHub.'
      : 'Não foi possível carregar a lista de filmes.';
  } finally {
    filmesBusy = false;
    if (view === 'filmes') render();
  }
}

function filmeCard(f) {
  const year = f.date ? f.date.slice(0, 4) : '';
  const meta = [f.type, year, f.genres?.slice(0, 2).join(', '), f.runtime && f.type === 'Filme' ? `${f.runtime} min` : '',
    f.seasons ? `${f.seasons} temporada${f.seasons > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
  const where = filmes.whereText(f.where);
  return `
    <article class="film">
      <div class="film-rank">${f.rank}</div>
      ${f.poster ? `<img class="poster" src="${esc(f.poster)}" alt="" loading="lazy">` : '<div class="poster none">🎬</div>'}
      <div class="film-info">
        <h3>${esc(f.title)}</h3>
        <div class="film-meta">${esc(meta)}</div>
        <div class="film-rate"><span class="rate">★ ${filmes.nota(f.rating)}<small>/10</small></span>
          ${(f.tags || []).map((t) => `<span class="ftag">${esc(t)}</span>`).join('')}</div>
        ${f.overview ? `<p class="film-text"${f.overviewLang === 'en' ? ' lang="en"' : ''}>${esc(f.overview)}</p>` : ''}
        <div class="film-where">${where ? `📺 ${esc(where)}` : '📺 Cinema / plataforma a confirmar'}</div>
      </div>
    </article>`;
}

function renderFilmes() {
  loadFilmes();
  const c = filmesState;
  let html = `<h2 class="section-title">🎬 Filmes e séries para ver</h2>
    <p class="hint">Recentes e bem avaliados, escolhidos pelo seu gosto: roubos e golpes, hackers e tecnologia,
    estratégia, espionagem e guerra. Ordem: os melhores primeiro (nota de 0 a 10).</p>`;
  if (!c.items.length) {
    html += `<div class="card empty-card"><p>${filmesBusy ? 'A carregar a lista…' : esc(filmesError || 'Ainda sem lista de filmes.')}</p></div>`;
    return html;
  }
  html += `<div class="films">${c.items.map(filmeCard).join('')}</div>`;
  const when = c.updatedAt ? new Date(c.updatedAt) : null;
  html += `<p class="note">Lista atualizada todos os dias${when ? ` (última: ${shortDate(dayKey(when))} às ${hhmm(when)})` : ''}.
    ${filmesError ? esc(filmesError) : ''} Notas: IMDb. Resumos e imagens: Wikipédia.</p>`;
  return html;
}

/* ---------------- Detalhes de um jogo ---------------- */

const EVENT_ICON = { goal: '⚽', pen: '⚽', own: '⚽', yellow: '🟨', red: '🟥' };
const EVENT_NOTE = { pen: ' (pénalti)', own: ' (contra)' };

function favButton(team) {
  const on = favorites.isFavTeam(team);
  return `<button type="button" class="fav-btn${on ? ' on' : ''}" data-fav="${esc(team.id || '')}" data-name="${esc(team.name)}"
    aria-pressed="${on}">${on ? '★ A seguir' : '☆ Seguir'}</button>`;
}

async function loadDetail(m, force = false) {
  if (detailBusy) return;
  detailBusy = true;
  detailError = '';
  try {
    await detalhes.fetchDetails(m, leagueByKey(m.league), force);
  } catch (e) {
    console.warn('detalhes', e);
    detailError = /indisponíveis/.test(e.message) ? e.message : 'Não foi possível carregar os detalhes.';
  } finally {
    detailBusy = false;
    if (openMatch === m.id) render();
  }
}

function renderDetail(m, now) {
  const l = leagueByKey(m.league);
  const d = detalhes.cachedDetails(m);
  if (!d && !detailBusy && !detailError && m.state !== 'pre') loadDetail(m);
  const live = isLiveish(m, now);
  const score = d?.score && m.state !== 'pre' ? d.score : m.score;
  const clock = live ? (d?.clock || m.minute || 'AO VIVO') : m.state === 'done' ? 'Terminado' : m.state === 'off' ? 'Adiado / cancelado' : '';
  const day = dayKey(new Date(m.start));
  let html = `<button type="button" class="back" data-close>‹ Voltar</button>
    <article class="detail" style="--c:${l?.color || 'var(--accent)'}">
      <div class="detail-top">${leagueTag(m.league)}<span>${esc(dayLabel(day, now))} ${shortDate(day)} · ${hhmm(new Date(m.start))}</span></div>
      <div class="detail-score">
        <div class="dteam"><b>${esc(m.home.name)}</b>${favButton(m.home)}</div>
        <div class="dmid">${score ? `<span class="big-score">${score.home} – ${score.away}</span>` : '<span class="big-x">x</span>'}
          ${clock ? `<span class="minute">${live ? '<span class="dot"></span>' : ''}${esc(clock)}</span>` : ''}</div>
        <div class="dteam"><b>${esc(m.away.name)}</b>${favButton(m.away)}</div>
      </div>
      <p class="detail-ch">📺 ${esc(channelText(m))}</p>
    </article>`;

  if (m.state === 'pre') {
    html += `<div class="card empty-card"><p>O jogo ainda não começou. Os golos e cartões aparecem aqui durante o jogo.</p></div>`;
  } else if (!d) {
    html += `<div class="card empty-card"><p>${detailBusy ? 'A carregar os detalhes…' : esc(detailError || 'Sem detalhes.')}</p></div>`;
  } else {
    html += '<h2 class="section-title">Lances</h2>';
    if (d.events.length) {
      html += `<div class="card events">${d.events.map((e) => `
        <div class="ev ${e.side || ''}">
          <span class="ev-min">${esc(e.minute)}</span>
          <span class="ev-ico">${EVENT_ICON[e.kind]}</span>
          <span class="ev-txt"><b>${esc(e.player)}</b>${EVENT_NOTE[e.kind] || ''}${e.assist ? `<small>assistência: ${esc(e.assist)}</small>` : ''}
            <small>${esc(e.side === 'home' ? m.home.name : e.side === 'away' ? m.away.name : '')}</small></span>
        </div>`).join('')}</div>`;
    } else {
      html += '<div class="card empty-card"><p>Sem golos nem cartões até agora.</p></div>';
    }
    if (d.stats.length) {
      html += `<h2 class="section-title">Estatísticas</h2><div class="card stats">
        <div class="st-head"><span>${esc(m.home.name)}</span><span>${esc(m.away.name)}</span></div>
        ${d.stats.map((x) => {
          const a = parseFloat(x.home) || 0; const b = parseFloat(x.away) || 0;
          const pct = a + b ? Math.round((a / (a + b)) * 100) : 50;
          return `<div class="st"><div class="st-row"><b>${esc(x.home)}</b><span>${esc(x.label)}</span><b>${esc(x.away)}</b></div>
            <div class="st-bar"><i style="width:${pct}%"></i></div></div>`;
        }).join('')}</div>`;
    }
    const info = [d.venue && `🏟️ ${d.venue}`, d.referee && `Árbitro: ${d.referee}`, d.attendance && `Público: ${d.attendance.toLocaleString('pt-PT')}`].filter(Boolean);
    if (info.length) html += `<p class="note">${info.map(esc).join(' · ')}</p>`;
    html += `<p class="note">Dados: ESPN. <button type="button" class="link" data-reload-detail>Atualizar detalhes</button></p>`;
  }
  return html;
}

function openDetail(id) {
  if (!state.matches.some((m) => m.id === id)) return;
  openMatch = id;
  detailError = '';
  try { history.pushState({ jogo: id }, ''); } catch { /* sem histórico */ }
  render();
  window.scrollTo(0, 0);
}

function closeDetail(fromHistory = false) {
  if (!openMatch) return;
  openMatch = null;
  if (!fromHistory) { try { history.back(); } catch { /* sem histórico */ } }
  render();
}

// Botão "voltar" do Android: fecha os detalhes em vez de sair do app.
window.addEventListener('popstate', () => closeDetail(true));

/* ---------------- Ajustes (rodapé): letras, tema, avisos ---------------- */

const FONT_KEY = 'jogos-ao-vivo:letras';
const FONTS = [['normal', 'Normais'], ['grande', 'Grandes'], ['enorme', 'Muito grandes']];
const THEME_NAMES = { auto: 'Automático', dark: 'Escuro', light: 'Claro' };

function readFont() {
  try { const f = localStorage.getItem(FONT_KEY); return FONTS.some(([k]) => k === f) ? f : 'normal'; } catch { return 'normal'; }
}
function applyFont(f) {
  if (f === 'normal') document.documentElement.removeAttribute('data-letras');
  else document.documentElement.setAttribute('data-letras', f);
}
applyFont(readFont());

function renderSettings() {
  const box = $('#settings');
  if (!box) return;
  const font = readFont();
  const theme = globalThis.JogosTema?.get() || 'auto';
  let avisos = '';
  if (notify.available()) {
    const on = notify.enabled();
    const warn = on && notify.available() && notifInfo?.reason === 'permission'
      ? '<small class="error">O Android não deixou mostrar avisos. Ative em Definições › Apps › Jogos ao Vivo › Notificações.</small>' : '';
    avisos = `<button type="button" class="set-btn" data-set="avisos" aria-pressed="${on}">🔔 Avisos: <b>${on ? 'Ligados' : 'Desligados'}</b></button>${warn}`;
  }
  box.innerHTML = `
    <button type="button" class="set-btn" data-set="letras">🔠 Letras: <b>${FONTS.find(([k]) => k === font)[1]}</b></button>
    <button type="button" class="set-btn" data-set="tema">🌓 Tema: <b>${THEME_NAMES[theme]}</b></button>
    ${avisos}`;
}

$('#settings')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-set]');
  if (!b) return;
  if (b.dataset.set === 'letras') {
    const i = FONTS.findIndex(([k]) => k === readFont());
    const next = FONTS[(i + 1) % FONTS.length][0];
    try { localStorage.setItem(FONT_KEY, next); } catch { /* vale só nesta sessão */ }
    applyFont(next);
  } else if (b.dataset.set === 'tema') {
    const order = ['auto', 'dark', 'light'];
    const t = globalThis.JogosTema?.get() || 'auto';
    globalThis.JogosTema?.set(order[(order.indexOf(t) + 1) % order.length]);
  } else if (b.dataset.set === 'avisos') {
    notify.setEnabled(!notify.enabled());
    syncNotifications();
  }
  renderSettings();
  render();
});

function render() {
  const now = Date.now();
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === view)));
  const liveN = state.matches.filter((m) => isLiveish(m, now)).length;
  const badge = document.querySelector('.tab[data-view="aovivo"] .badge');
  if (badge) { badge.textContent = liveN || ''; badge.hidden = !liveN; }

  if (!state.matches.length && !state.fetchedAt && view !== 'filmes') {
    $('#content').innerHTML = busy ? '<div class="card empty-card"><p>A carregar os jogos…</p></div>'
      : `<div class="card empty-card"><p>Ainda sem dados. Ligue a internet e toque em “Atualizar”.</p>${message ? `<p class="error">${esc(message)}</p>` : ''}</div>`;
  } else {
    const views = { aovivo: renderAoVivo, resultados: renderResultados, campeonatos: renderCampeonatos, calendario: renderCalendario, filmes: renderFilmes };
    const om = openMatch && state.matches.find((m) => m.id === openMatch);
    if (openMatch && !om) openMatch = null;
    $('#content').innerHTML = om ? renderDetail(om, now) : (views[view] || renderAoVivo)(now);
    const chip = document.querySelector('.chip.on');
    if (chip) chip.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  const when = state.fetchedAt ? `Atualizado às ${hhmm(new Date(Math.max(state.fetchedAt, state.liveFetchedAt || 0)))}` : '';
  const missing = state.missing?.length ? `Sem dados agora: ${state.missing.join(', ')}` : '';
  $('#status').textContent = busy ? 'A atualizar…' : [message, missing, when].filter(Boolean).join(' — ');
  $('#refresh').disabled = busy;
}

/* ---------------- Botões ---------------- */

$('#refresh').addEventListener('click', () => {
  const last = Math.max(state.fetchedAt || 0, state.liveFetchedAt || 0);
  if (!message && Date.now() - last < MANUAL_MIN_GAP) {
    message = 'Já está atualizado (espere uns minutos).';
    render();
    message = '';
    return;
  }
  run(refreshAgenda);
});

document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.view === 'campeonatos' && view === 'campeonatos') selectedLeague = null;
  if (openMatch) closeDetail();
  view = b.dataset.view;
  render();
  window.scrollTo(0, 0);
}));

$('#content').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) { closeDetail(); return; }
  if (e.target.closest('[data-reload-detail]')) {
    const m = state.matches.find((x) => x.id === openMatch);
    if (m) { loadDetail(m, true); render(); }
    return;
  }
  const fb = e.target.closest('[data-fav]');
  if (fb) {
    favorites.toggle({ id: fb.dataset.fav || null, name: fb.dataset.name });
    syncNotifications();
    render();
    return;
  }
  const uf = e.target.closest('[data-unfav]');
  if (uf) {
    const f = favorites.all()[Number(uf.dataset.unfav)];
    if (f && confirm(`Deixar de seguir ${f.name}?`)) { favorites.toggle(f); syncNotifications(); render(); }
    return;
  }
  const mrow = e.target.closest('[data-mid]');
  if (mrow) { openDetail(mrow.dataset.mid); return; }
  const chip = e.target.closest('.chip');
  const lg = e.target.closest('.league-btn');
  if (lg) leagueTab = 'jogos';
  const back = e.target.closest('[data-back]');
  if (chip) selectedDay = chip.dataset.day;
  else if (lg) { selectedLeague = lg.dataset.league; window.scrollTo(0, 0); }
  else if (back) selectedLeague = null;
  else if (e.target.closest('[data-ltab]')) leagueTab = e.target.closest('[data-ltab]').dataset.ltab;
  else return;
  render();
});

$('#content').addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-mid]')) { e.preventDefault(); openDetail(e.target.dataset.mid); }
});

renderSettings();

/* ---------------- Versão nova do app ---------------- */

async function showUpdateBanner(force = false) {
  let info = null;
  try { info = await update.checkUpdate(force); } catch (e) { console.warn('verificar versão', e); }
  const box = $('#update');
  if (!box) return;
  if (!info) { box.hidden = true; box.innerHTML = ''; return; }
  box.innerHTML = `
    <div class="update-text"><b>Há uma versão nova do app</b>
      <span>Versão ${info.versionCode} (tem a ${update.currentVersion()}). Instala por cima, sem perder nada.</span></div>
    <div class="update-actions">
      <a class="update-go" href="${update.APK_URL}">Atualizar</a>
      <button type="button" class="update-later">Depois</button>
    </div>`;
  box.hidden = false;
  box.querySelector('.update-later').addEventListener('click', () => {
    update.dismiss(info.versionCode);
    box.hidden = true;
  });
}

showUpdateBanner();
document.addEventListener('visibilitychange', () => { if (!document.hidden) showUpdateBanner(); });

// Redesenha a cada minuto (para um jogo passar a "AO VIVO" na hora certa), sem gastar pedidos.
setInterval(() => { if (!document.hidden && !busy) render(); }, 60 * 1000);

onOpen();
