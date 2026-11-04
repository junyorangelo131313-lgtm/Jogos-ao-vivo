import { LEAGUES, leagueByKey } from './leagues.js';
import { addDays, dayKey, hhmm, shortDate, todayTomorrow, weekday } from './time.js';
import { fetchEspn } from './sources/espn.js';
import { fetchFootballData } from './sources/footballdata.js';
import { fetchChannels } from './channels.js';
import { calendarDays, isLiveish, isSantos, mergeLive, nextLiveDelay, sortMatches } from './logic.js';
import * as store from './store.js';

const CAL_DAYS = 14;                       // calendário: hoje + 13 dias
const AGENDA_MAX_AGE = 4 * 60 * 60 * 1000; // agenda: no máximo ~6 vezes por dia
const LIVE_INTERVAL = 10 * 60 * 1000;      // ao vivo: de 10 em 10 minutos
const MANUAL_MIN_GAP = 2 * 60 * 1000;      // botão "Atualizar": no máximo de 2 em 2 min
const FD_KEY = (window.APP_CONFIG && window.APP_CONFIG.footballDataKey) || '';

let state = store.load();
let busy = false;
let liveTimer = null;
let message = '';
let view = 'hoje';         // 'hoje' | 'calendario'
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
  const lastDay = addDays(today, CAL_DAYS - 1);
  const { matches: fresh, failed, errors } = await loadLeagues(LEAGUES, addDays(today, -1), lastDay); // a ESPN usa o dia dos EUA: o "ontem" de lá tem jogos da madrugada de hoje em Portugal
  if (failed.length === LEAGUES.length) {
    const why = Object.values(errors)[0] || '';
    throw new Error(`Não foi possível ligar ao servidor dos jogos${why ? ` (${why})` : ''}.`);
  }

  // Para as ligas que falharam, mantém o que já estava guardado.
  const failedKeys = new Set(failed.map((l) => l.key));
  const kept = state.matches.filter((m) => failedKeys.has(m.league));
  const seen = new Set();
  let matches = [...fresh, ...kept]
    .filter((m) => { const d = dayKey(new Date(m.start)); return d >= today && d <= lastDay; })
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

async function refreshLive() {
  const now = Date.now();
  const keys = [...new Set(state.matches.filter((m) => isLiveish(m, now)).map((m) => m.league))];
  if (!keys.length) return;
  const { today } = todayTomorrow(new Date(now));
  const { matches: fresh } = await loadLeagues(keys.map(leagueByKey), addDays(today, -1), addDays(today, 1));
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

function liveCard(m) {
  return `
    <div class="live-card${isSantos(m) ? ' santos' : ''}">
      <div class="live-top"><span>${esc(leagueByKey(m.league)?.name)}</span>
        <span class="minute">${esc(m.minute || 'A começar')}</span></div>
      <div class="teams">${teams(m)}</div>
      <div class="channel">${esc(channelText(m))}</div>
    </div>`;
}

function row(m, now, { showTbc = true, showLeague = false } = {}) {
  const live = isLiveish(m, now);
  const time = m.state === 'done' ? 'Fim' : live ? 'AO VIVO' : hhmm(new Date(m.start));
  const ch = channelText(m, showTbc);
  const extra = [showLeague ? leagueByKey(m.league)?.name : '', ch].filter(Boolean).join(' · ');
  return `
    <div class="row${isSantos(m) ? ' santos' : ''}${m.state === 'done' ? ' done' : ''}">
      <div class="time${live ? ' is-live' : ''}">${esc(time)}</div>
      <div class="info">
        <div class="teams">${teams(m)}</div>
        ${extra ? `<div class="channel${m.channels?.length ? '' : ' tbc'}">${esc(extra)}</div>` : ''}
      </div>
    </div>`;
}

function leaguesOfDay(key, now, opts) {
  const ofDay = state.matches.filter((m) => dayKey(new Date(m.start)) === key);
  if (!ofDay.length) return '<p class="empty">Sem jogos destes campeonatos neste dia.</p>';
  let html = '';
  for (const l of LEAGUES) {
    const list = sortMatches(ofDay.filter((m) => m.league === l.key));
    if (!list.length) continue;
    html += `<section class="league"><h3>${esc(l.name)}</h3>${list.map((m) => row(m, now, opts)).join('')}</section>`;
  }
  return html;
}

function liveSection(now) {
  const live = sortMatches(state.matches.filter((m) => isLiveish(m, now)));
  let html = '<h2 class="live-title"><span class="dot"></span>AO VIVO</h2>';
  if (live.length) return html + live.map(liveCard).join('');
  html += '<p class="empty">Nenhum jogo a decorrer agora.</p>';
  const next = sortMatches(state.matches.filter((m) => m.state === 'pre' && Date.parse(m.start) > now))[0];
  if (next) {
    const d = dayKey(new Date(next.start));
    const { today, tomorrow } = todayTomorrow(new Date(now));
    const when = d === today ? 'hoje' : d === tomorrow ? 'amanhã' : `${weekday(d)} ${shortDate(d)}`;
    html += `<p class="next">Próximo: <b>${esc(when)} às ${hhmm(new Date(next.start))}</b> — ${esc(next.home.name)} x ${esc(next.away.name)}
      <span class="muted">(${esc(leagueByKey(next.league)?.name)})</span></p>`;
  }
  return html;
}

function santosBox(now) {
  const list = sortMatches(state.matches.filter((m) => isSantos(m) && m.state !== 'done')).slice(0, 3);
  if (!list.length) return '';
  return `<section class="santos-box"><h3><span class="star">★</span>Próximos jogos do Santos</h3>
    ${list.map((m) => {
      const d = dayKey(new Date(m.start));
      return `<div class="santos-line"><b>${esc(weekday(d))} ${shortDate(d)} · ${hhmm(new Date(m.start))}</b>
        ${esc(m.home.name)} x ${esc(m.away.name)}${isLiveish(m, now) ? ' <span class="minute">AO VIVO</span>' : ''}</div>`;
    }).join('')}</section>`;
}

function renderHoje(now) {
  const { today, tomorrow } = todayTomorrow(new Date(now));
  return `
    <section id="live" aria-live="polite">${liveSection(now)}</section>
    <h2 class="day">Hoje <small>${shortDate(today)}</small></h2>${leaguesOfDay(today, now)}
    <h2 class="day">Amanhã <small>${shortDate(tomorrow)}</small></h2>${leaguesOfDay(tomorrow, now)}`;
}

function renderCalendario(now) {
  const { today, tomorrow } = todayTomorrow(new Date(now));
  const days = calendarDays(today, CAL_DAYS);
  if (!selectedDay || !days.includes(selectedDay)) selectedDay = today;
  const counts = new Map();
  for (const m of state.matches) {
    const d = dayKey(new Date(m.start));
    counts.set(d, (counts.get(d) || 0) + 1);
  }
  const santosDays = new Set(state.matches.filter(isSantos).map((m) => dayKey(new Date(m.start))));
  const label = (d) => (d === today ? 'Hoje' : d === tomorrow ? 'Amanhã' : weekday(d));
  const chips = days.map((d) => `
    <button type="button" class="chip${d === selectedDay ? ' on' : ''}${santosDays.has(d) ? ' has-santos' : ''}" data-day="${d}">
      <span class="chip-wd">${esc(label(d))}</span>
      <span class="chip-date">${shortDate(d)}</span>
      <span class="chip-n">${counts.get(d) ? `${counts.get(d)} jogo${counts.get(d) > 1 ? 's' : ''}` : '—'}</span>
    </button>`).join('');
  const near = [today, tomorrow].includes(selectedDay);
  return `
    ${santosBox(now)}
    <div class="chips" role="tablist" aria-label="Escolher dia">${chips}</div>
    <h2 class="day">${esc(label(selectedDay))} <small>${shortDate(selectedDay)}</small></h2>
    ${leaguesOfDay(selectedDay, now, { showTbc: near })}
    ${near ? '' : '<p class="note">Os canais de TV aparecem na véspera do jogo.</p>'}`;
}

function render() {
  const now = Date.now();
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === view)));

  if (!state.matches.length && !state.fetchedAt) {
    $('#content').innerHTML = busy ? '<p class="empty">A carregar os jogos…</p>'
      : `<p class="empty">Ainda sem dados. Ligue a internet e toque em “Atualizar”.</p>${message ? `<p class="error">${esc(message)}</p>` : ''}`;
  } else {
    $('#content').innerHTML = view === 'calendario' ? renderCalendario(now) : renderHoje(now);
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
  view = b.dataset.view;
  render();
  window.scrollTo(0, 0);
}));

$('#content').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  selectedDay = chip.dataset.day;
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
