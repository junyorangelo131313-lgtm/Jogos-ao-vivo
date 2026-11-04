import { LEAGUES, leagueByKey } from './leagues.js';
import { addDays, dayKey, hhmm, shortDate, todayTomorrow } from './time.js';
import { fetchEspn } from './sources/espn.js';
import { fetchFootballData } from './sources/footballdata.js';
import { fetchChannels } from './channels.js';
import { isLiveish, isSantos, mergeLive, nextLiveDelay, sortMatches } from './logic.js';
import * as store from './store.js';

const AGENDA_MAX_AGE = 4 * 60 * 60 * 1000; // agenda: no máximo ~6 vezes por dia
const LIVE_INTERVAL = 10 * 60 * 1000;      // ao vivo: de 10 em 10 minutos
const MANUAL_MIN_GAP = 10 * 60 * 1000;     // botão "Atualizar": no máximo de 10 em 10 min
const FD_KEY = (window.APP_CONFIG && window.APP_CONFIG.footballDataKey) || '';

let state = store.load();
let busy = false;
let liveTimer = null;
let message = '';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- Dados ---------------- */

async function loadLeagues(leagues, fromKey, toKey) {
  const results = await Promise.all(leagues.map((l) => fetchEspn(l, fromKey, toKey).then(
    (ms) => ({ l, ms }), (err) => ({ l, err }),
  )));
  let matches = results.filter((r) => r.ms).flatMap((r) => r.ms);
  let failed = results.filter((r) => r.err).map((r) => r.l);
  if (failed.length && FD_KEY) {
    try {
      const withFd = failed.filter((l) => l.fd);
      matches = matches.concat(await fetchFootballData(withFd, fromKey, toKey, FD_KEY));
      failed = failed.filter((l) => !l.fd);
    } catch (e) { console.warn('football-data falhou', e); }
  }
  return { matches, failed };
}

async function refreshAgenda() {
  const now = new Date();
  const { today, tomorrow } = todayTomorrow(now);
  const { matches: fresh, failed } = await loadLeagues(LEAGUES, addDays(today, -1), addDays(today, 2));
  if (failed.length === LEAGUES.length) throw new Error('sem ligação');

  // Para as ligas que falharam, mantém o que já estava guardado.
  const failedKeys = new Set(failed.map((l) => l.key));
  const kept = state.matches.filter((m) => failedKeys.has(m.league));
  const seen = new Set();
  let matches = [...fresh, ...kept]
    .filter((m) => [today, tomorrow].includes(dayKey(new Date(m.start))))
    .filter((m) => !seen.has(m.id) && seen.add(m.id));

  const oldById = new Map(state.matches.map((m) => [m.id, m]));
  try {
    const ch = await fetchChannels(matches);
    matches = matches.map((m) => ({ ...m, channels: ch[m.id] || oldById.get(m.id)?.channels || [] }));
  } catch (e) {
    console.warn('canais indisponíveis', e);
    matches = matches.map((m) => ({ ...m, channels: oldById.get(m.id)?.channels || [] }));
  }

  const missing = failed.filter((l) => !kept.some((m) => m.league === l.key)).map((l) => l.name);
  state = { ...state, matches, today, missing, fetchedAt: Date.now(), liveFetchedAt: Date.now() };
  store.save(state);
}

async function refreshLive() {
  const now = Date.now();
  const keys = [...new Set(state.matches.filter((m) => isLiveish(m, now)).map((m) => m.league))];
  if (!keys.length) return;
  const { today } = todayTomorrow(new Date(now));
  const { matches: fresh } = await loadLeagues(keys.map(leagueByKey), addDays(today, -1), addDays(today, 1));
  state = { ...state, matches: mergeLive(state.matches, fresh), liveFetchedAt: Date.now() };
  store.save(state);
}

async function run(task, failMsg) {
  if (busy) return;
  busy = true;
  render();
  try {
    await task();
    message = '';
  } catch (e) {
    console.warn(e);
    message = failMsg;
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
    if (agendaIsOld()) run(refreshAgenda, 'Sem internet. A mostrar os dados guardados.');
    else run(refreshLive, 'Não foi possível atualizar o placar.');
  }, Math.min(delay, 2 ** 31 - 1));
}

function onOpen() {
  render();
  if (agendaIsOld()) run(refreshAgenda, 'Sem internet. A mostrar os dados guardados.');
  else scheduleLive();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopLive();
  else onOpen();
});

/* ---------------- Tela ---------------- */

function channelText(m) {
  if (m.state === 'off') return 'Adiado / cancelado';
  return m.channels?.length ? m.channels.join(' · ') : 'canal a confirmar';
}

function scoreOrX(m) {
  return m.score ? `<b class="score">${m.score.home} – ${m.score.away}</b>` : '<span class="x">x</span>';
}

function liveCard(m) {
  return `
    <div class="live-card${isSantos(m) ? ' santos' : ''}">
      <div class="live-top"><span class="league-tag">${esc(leagueByKey(m.league)?.name)}</span>
        <span class="minute">${esc(m.minute || 'A começar')}</span></div>
      <div class="teams">${esc(m.home.name)} ${scoreOrX(m)} ${esc(m.away.name)}</div>
      <div class="channel">${esc(channelText(m))}</div>
    </div>`;
}

function row(m, now) {
  const live = isLiveish(m, now);
  const time = m.state === 'done' ? 'Fim' : live ? 'AO VIVO' : hhmm(new Date(m.start));
  return `
    <div class="row${isSantos(m) ? ' santos' : ''}${m.state === 'done' ? ' done' : ''}">
      <div class="time${live ? ' is-live' : ''}">${esc(time)}</div>
      <div class="info">
        <div class="teams">${isSantos(m) ? '<span class="star">★</span>' : ''}${esc(m.home.name)} ${scoreOrX(m)} ${esc(m.away.name)}</div>
        <div class="channel${m.channels?.length ? '' : ' tbc'}">${esc(channelText(m))}</div>
      </div>
    </div>`;
}

function daySection(title, key, now) {
  const ofDay = state.matches.filter((m) => dayKey(new Date(m.start)) === key);
  let html = `<h2 class="day">${title} <small>${shortDate(key)}</small></h2>`;
  if (!ofDay.length) return `${html}<p class="empty">Sem jogos destes campeonatos.</p>`;
  for (const l of LEAGUES) {
    const list = sortMatches(ofDay.filter((m) => m.league === l.key));
    if (!list.length) continue;
    html += `<section class="league"><h3>${esc(l.name)}</h3>${list.map((m) => row(m, now)).join('')}</section>`;
  }
  return html;
}

function render() {
  const now = Date.now();
  const { today, tomorrow } = todayTomorrow(new Date(now));
  const live = sortMatches(state.matches.filter((m) => isLiveish(m, now)));

  $('#live').innerHTML = `
    <h2 class="live-title"><span class="dot"></span>AO VIVO</h2>
    ${live.length ? live.map(liveCard).join('') : '<p class="empty">Nenhum jogo a decorrer agora.</p>'}`;

  if (!state.matches.length && !state.fetchedAt) {
    $('#list').innerHTML = busy ? '<p class="empty">A carregar os jogos…</p>'
      : '<p class="empty">Ainda sem dados. Ligue a internet e toque em “Atualizar”.</p>';
  } else {
    $('#list').innerHTML = daySection('Hoje', today, now) + daySection('Amanhã', tomorrow, now);
  }

  const when = state.fetchedAt ? `Atualizado às ${hhmm(new Date(Math.max(state.fetchedAt, state.liveFetchedAt || 0)))}` : '';
  const missing = state.missing?.length ? `Sem dados agora: ${state.missing.join(', ')}` : '';
  $('#status').textContent = busy ? 'A atualizar…' : [message, missing, when].filter(Boolean).join(' — ');
  $('#refresh').disabled = busy;
}

$('#refresh').addEventListener('click', () => {
  const last = Math.max(state.fetchedAt || 0, state.liveFetchedAt || 0);
  if (Date.now() - last < MANUAL_MIN_GAP) {
    message = 'Já está atualizado (espere uns minutos).';
    render();
    return;
  }
  run(refreshAgenda, 'Sem internet. A mostrar os dados guardados.');
});

// Redesenha a cada minuto (para um jogo passar a "AO VIVO" na hora certa), sem gastar pedidos.
setInterval(() => { if (!document.hidden && !busy) render(); }, 60 * 1000);

onOpen();
