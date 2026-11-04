// Tudo o que é mostrado usa o fuso de Portugal (Europe/Lisbon).
// O horário de verão é tratado automaticamente pelo próprio sistema (Intl).
export const TZ_PT = 'Europe/Lisbon';
export const TZ_BR = 'America/Sao_Paulo';

/** Dia (AAAA-MM-DD) de uma data num fuso. */
export function dayKey(date, tz = TZ_PT) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (t) => p.find((x) => x.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Hora HH:MM de uma data num fuso. */
export function hhmm(date, tz = TZ_PT) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t) => p.find((x) => x.type === t).value;
  return `${get('hour')}:${get('minute')}`;
}

/** Soma dias a uma chave AAAA-MM-DD (sem problemas de horário de verão). */
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n, 12));
  return dt.toISOString().slice(0, 10);
}

export function todayTomorrow(now = new Date()) {
  const today = dayKey(now);
  return { today, tomorrow: addDays(today, 1) };
}

/** "04/11" a partir de "2026-11-04". */
export function shortDate(key) {
  const [, m, d] = key.split('-');
  return `${d}/${m}`;
}
