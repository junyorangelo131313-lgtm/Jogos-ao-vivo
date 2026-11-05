import { LEAGUES, leagueByKey } from './leagues.js';
import { addDays, dayKey, hhmm, shortDate, todayTomorrow, weekday } from './time.js';
import { fetchEspn } from './sources/espn.js';
import { fetchFootballData } from './sources/footballdata.js';
import { fetchChannels } from './channels.js';
import { calendarDays, isLiveish, isSantos, mergeLive, needsResult, nextLiveDelay, sortMatches } from './logic.js';
import * as store from './store.js';
import * as filmes from './filmes.js';

const CAL_DAYS = 14;                       // calendário: hoje + 13 dias
const AGENDA_MAX_AGE = 4 * 60 * 60 * 1000; // agenda: no máximo ~6 vezes por dia
const LIVE_INTERVAL = 10 * 60 * 1000;      // ao vivo: de 10 em 10 minutos
const MANUAL_MIN_GAP = 2 * 60 * 1000;      // botão "Atualizar": no máximo de 2 em 2 min
const FD_KEY = (window.APP_CONFIG && window.APP_CONFIG.footballDataKey) || '';

let state = store.load();
let busy = false;
let liveTimer = null;
let message = '';
let view = 'aovivo';       // 'aovivo' | 'resultados' | 'campeonatos' | 'calendario' | 'filmes'
let selectedLeague = null; // campeonato aberto no separador Campeonatos
let filmesState = filmes.loadCache();
let filmesBusy = false;
let filmesError = '';
let selectedDay = null;    // dia escolhido no calendário

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
  const { matches: fresh, failed, errors } = await loadLeagues(LEAGUES, addDays(today, -2), lastDay);
  if (failed.length === LEAGUES.length) {
    const why = Object.values(errors)[0] || '';
    throw new Error(`Não foi possível ligar ao servidor dos jogos${why ? ` (${why})` : ''}.`);
  }

  // Para as ligas que falharam, mantém o que já estava guardado.
  const failedKeys = new Set(failed.map((l) => l.key));
  const kept = state.matches.filter((m) => failedKeys.has(m.league));
  const seen = new Set();
  let matches = [...fresh, ...kept]
    .filter((m) => { const d = dayKey(new Date(m.start)); return d >= yesterday && d <= lastDay; })
    .filter((m) => !seen.has(m.id) && seen.add(m.id));

  // Canais: o site só tem as páginas de hoje e de amanhã.
  const oldById = new Map(state.matches.map((m) => [m.id, m]));
  const near = matches.filter((m) => [today, tomorrow].includes(dayKey(new Date(m.start))));
  let ch = {};
  try {
    ch = await fetchChannels(near);
  } catch (e) {
    console.warn('canais indisponíveis', e);
  }
  matches = matches.map((m) => ({ ...m, channels: ch[m.id] || oldById.get(m.id)?.channels || [] }));

  const missing = failed.filter((l) => !kept.some((m) => m.league === l.key)).map((l) => `${l.name} (${errors[l.key]})`);
  state = { ...state, matches, today, missing, fetchedAt: Date.now(), liveFetchedAt: Date.now() };
  store.save(state);
}

const pendingResults = (now = Date.now()) => state.matches.filter((m) => needsResult(m, now, state.liveFetchedAt || 0));

/** Atualiza placares: jogos a decorrer + jogos que já acabaram e ainda não têm o resultado final. */
async function refreshLive() {
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
  const delay = nextLiveDelay(state.matches, state.liveFetchedAt || 0, LIVE_INTERVAL);
  if (delay == null) return;
  liveTimer = setTimeout(() => {
    run(agendaIsOld() ? refreshAgenda : refreshLive);
  }, Math.min(delay, 2 ** 31 - 1));
}

function onOpen() {
  render();
  if (agendaIsOld()) run(refreshAgenda);
  else if (pendingResults().length) run(refreshLive); // buscar placares finais que faltam
  else scheduleLive();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopLive();
  else onOpen();
});

/* ---------------- Tela ---------------- */

function channelText(m, showTbc = true) {
  if (m.state === 'off') return 'Adiado / cancelado';
  if (m.channels?.length) return m.channels.join(' · ');
  return showTbc ? 'canal a confirmar' : '';
}

function scoreOrX(m) {
  return m.score ? `<b class="score">${m.score.home} – ${m.score.away}</b>` : '<span class="x">x</span>';
}

function teams(m) {
  return `${isSantos(m) ? '<span class="star">★</span>' : ''}${esc(m.home.name)} ${scoreOrX(m)} ${esc(m.away.name)}`;
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

function liveCard(m) {
  return `
    <div class="live-card${isSantos(m) ? ' santos' : ''}" style="--c:${leagueByKey(m.league)?.color || 'var(--accent)'}">
      <div class="live-top">${leagueTag(m.league)}<span class="minute"><span class="dot"></span>${esc(m.minute || 'A começar')}</span></div>
      <div class="teams big">${teams(m)}</div>
      <div class="channel">${esc(channelText(m))}</div>
    </div>`;
}

function row(m, now, { showTbc = true, showLeague = false, showDay = false } = {}) {
  const live = isLiveish(m, now);
  const time = m.state === 'done' ? 'Fim' : live ? 'AO VIVO' : hhmm(new Date(m.start));
  const ch = channelText(m, showTbc);
  const d = dayKey(new Date(m.start));
  return `
    <div class="row${isSantos(m) ? ' santos' : ''}${m.state === 'done' ? ' done' : ''}${live ? ' live' : ''}">
      <div class="time${live ? ' is-live' : ''}">${showDay && !live && m.state !== 'done' ? `<small>${esc(dayLabel(d, now))}</small>` : ''}${esc(time)}</div>
      <div class="info">
        <div class="teams">${teams(m)}</div>
        ${showLeague || ch ? `<div class="channel${m.channels?.length ? '' : ' tbc'}">${showLeague ? leagueTag(m.league) : ''}${esc(ch)}</div>` : ''}
      </div>
    </div>`;
}

function leaguesOfDay(key, now, opts = {}) {
  const ofDay = state.matches.filter((m) => dayKey(new Date(m.start)) === key && (!opts.only || opts.only(m)));
  if (!ofDay.length) return `<p class="empty">${opts.emptyText || 'Sem jogos neste dia.'}</p>`;
  let html = '';
  for (const l of LEAGUES) {
    const list = sortMatches(ofDay.filter((m) => m.league === l.key));
    if (!list.length) continue;
    html += `<section class="league" style="--c:${l.color}"><h3><span class="ldot"></span>${esc(l.name)}</h3>
      <div class="card">${list.map((m) => row(m, now, opts)).join('')}</div></section>`;
  }
  return html;
}

function santosBox(now) {
  const list = sortMatches(state.matches.filter((m) => isSantos(m) && m.state !== 'done')).slice(0, 3);
  if (!list.length) return '';
  return `<section class="santos-box"><h3><span class="star">★</span>Próximos jogos do Santos</h3>
    ${list.map((m) => {
      const d = dayKey(new Date(m.start));
      return `<div class="santos-line"><b>${esc(dayLabel(d, now))} ${shortDate(d)} · ${hhmm(new Date(m.start))}</b>
        ${esc(m.home.name)} x ${esc(m.away.name)}${isLiveish(m, now) ? ' <span class="minute">AO VIVO</span>' : ''}</div>`;
    }).join('')}</section>`;
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
  const next = sortMatches(state.matches.filter((m) => m.state === 'pre' && Date.parse(m.start) > now)).slice(0, 5);
  if (next.length) {
    html += `<h2 class="section-title">A seguir</h2>
      <div class="card">${next.map((m) => row(m, now, { showLeague: true, showDay: true })).join('')}</div>`;
  }
  return html + santosBox(now);
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

/* Separador 3: lista de campeonatos → jogos do campeonato escolhido */
function renderCampeonatos(now) {
  if (selectedLeague && leagueByKey(selectedLeague)) {
    const l = leagueByKey(selectedLeague);
    const list = sortMatches(state.matches.filter((m) => m.league === l.key));
    const near = nearDays(now);
    let html = `<button type="button" class="back" data-back>‹ Todos os campeonatos</button>
      <h2 class="section-title" style="--c:${l.color}"><span class="ldot big"></span>${esc(l.name)}</h2>`;
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
  const santosDays = new Set(state.matches.filter(isSantos).map((m) => dayKey(new Date(m.start))));
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
        ${f.overview ? `<p class="film-text">${esc(f.overview)}</p>` : ''}
        <div class="film-where">${where ? `📺 ${esc(where)}` : '📺 Plataforma ainda por confirmar'}</div>
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
    ${filmesError ? esc(filmesError) : ''} Dados: TMDB (themoviedb.org).</p>`;
  return html;
}

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
    $('#content').innerHTML = (views[view] || renderAoVivo)(now);
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
  view = b.dataset.view;
  render();
  window.scrollTo(0, 0);
}));

$('#content').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  const lg = e.target.closest('.league-btn');
  const back = e.target.closest('[data-back]');
  if (chip) selectedDay = chip.dataset.day;
  else if (lg) { selectedLeague = lg.dataset.league; window.scrollTo(0, 0); }
  else if (back) selectedLeague = null;
  else return;
  render();
});

function renderThemeButtons() {
  const t = globalThis.JogosTema?.get() || 'auto';
  document.querySelectorAll('.theme-opt').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === t)));
}
document.querySelectorAll('.theme-opt').forEach((b) => b.addEventListener('click', () => {
  globalThis.JogosTema?.set(b.dataset.theme);
  renderThemeButtons();
}));
renderThemeButtons();

// Redesenha a cada minuto (para um jogo passar a "AO VIVO" na hora certa), sem gastar pedidos.
setInterval(() => { if (!document.hidden && !busy) render(); }, 60 * 1000);

onOpen();
