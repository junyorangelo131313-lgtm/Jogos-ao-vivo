// Diagnóstico: corre o mesmo código do app contra os sites reais e mostra o que vem.
// Uso: node tools/diagnostico.mjs   (é corrido pelo workflow "Diagnóstico")
import { LEAGUES } from '../www/js/leagues.js';
import { espnUrl, parseEspn, fetchEspn } from '../www/js/sources/espn.js';
import { addDays, todayTomorrow } from '../www/js/time.js';

const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const { today } = todayTomorrow();
const from = addDays(today, -1);
const to = addDays(today, 14);
console.log(`Hoje (Lisboa): ${today}  período: ${from} → ${to}\n`);

async function probe(url, headers = {}) {
  const t = Date.now();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
    const body = await r.text();
    return { status: r.status, type: r.headers.get('content-type'), len: body.length, ms: Date.now() - t, body };
  } catch (e) {
    return { error: String(e?.cause?.message || e.message), ms: Date.now() - t };
  }
}

for (const l of LEAGUES) {
  for (const localized of [true, false]) {
    const url = espnUrl(l, from, to, localized);
    const r = await probe(url, { Accept: 'application/json' });
    let info = r.error ? `ERRO ${r.error}` : `HTTP ${r.status} ${r.type} ${r.len}B ${r.ms}ms`;
    if (r.body) {
      try {
        const data = JSON.parse(r.body);
        const ms = parseEspn(data, l);
        info += ` | eventos=${data.events?.length ?? 'sem campo events'} lidos=${ms.length}`;
        if (ms[0]) info += ` | 1º: ${ms[0].start} ${ms[0].home.name} x ${ms[0].away.name} (${ms[0].state})`;
        if (!data.events) info += ` | chaves: ${Object.keys(data).join(',')} | ${r.body.slice(0, 300)}`;
      } catch { info += ` | não é JSON: ${r.body.slice(0, 200).replace(/\s+/g, ' ')}`; }
    }
    console.log(`${l.name.padEnd(22)} ${localized ? 'pt' : '--'}  ${info}`);
  }
  // Também um dia só, para comparar com o período.
  const d = today.replaceAll('-', '');
  const r1 = await probe(`https://site.api.espn.com/apis/site/v2/sports/soccer/${l.espn}/scoreboard?dates=${d}`);
  console.log(`${''.padEnd(22)} 1dia ${r1.error || `HTTP ${r1.status} ${r1.len}B`}`);
}

for (const u of ['https://www.futebolnatv.com.br/jogos-hoje/', 'https://www.futebolnatv.com.br/jogos-amanha/']) {
  const r = await probe(u, { Accept: 'text/html' });
  console.log(`\n${u}: ${r.error || `HTTP ${r.status} ${r.type} ${r.len}B ${r.ms}ms`}`);
  if (r.body) console.log(r.body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600));
}

console.log('\n=== Como o app busca (fetchEspn) ===');
for (const l of LEAGUES) {
  const t = Date.now();
  try {
    const ms = await fetchEspn(l, from, to);
    const days = new Set(ms.map((m) => m.start.slice(0, 10)));
    console.log(`${l.name.padEnd(22)} OK ${ms.length} jogos em ${days.size} dias (${Date.now() - t}ms)` + (ms[0] ? ` | ex.: ${ms[0].start} ${ms[0].home.name} x ${ms[0].away.name}` : ''));
  } catch (e) {
    console.log(`${l.name.padEnd(22)} FALHOU ${e.message}`);
  }
}

console.log('\n=== Classificações (ESPN standings) ===');
for (const code of ['bra.1', 'eng.1', 'arg.1', 'uefa.champions', 'uefa.nations', 'fifa.worldq.conmebol', 'bra.copa_do_brazil']) {
  for (const base of ['https://site.api.espn.com/apis/v2/sports/soccer', 'https://site.web.api.espn.com/apis/v2/sports/soccer']) {
    const r = await probe(`${base}/${code}/standings?lang=pt&region=br`, { Accept: 'application/json' });
    if (r.error) { console.log(code, base.split('/')[2], 'ERRO', r.error); continue; }
    let info = `HTTP ${r.status} ${r.len}B`;
    try {
      const j = JSON.parse(r.body);
      const groups = j.children || (j.standings ? [j] : []);
      info += ` | grupos=${groups.length} chaves=${Object.keys(j).join(',')}`;
      const g = groups[0];
      const e = g?.standings?.entries || [];
      info += ` | 1º grupo "${g?.name || g?.abbreviation || ''}" ${e.length} equipas`;
      if (e[0]) {
        info += ` | ex: ${e[0].team?.displayName} stats: ` + (e[0].stats || []).map((s) => `${s.name || s.type}=${s.displayValue ?? s.value}`).join(' ');
        info += ` | note: ${JSON.stringify(e[0].note || null)}`;
      }
    } catch { info += ` | não é JSON: ${r.body.slice(0, 150)}`; }
    console.log(`${code.padEnd(22)} ${base.split('/')[2].padEnd(22)} ${info}`);
  }
}
