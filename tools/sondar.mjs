// Sonda códigos de competições na ESPN (um dia e períodos curtos).
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36';
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const codes = ['fra.1', 'uefa.champions', 'uefa.europa', 'uefa.europa.conf', 'uefa.nations', 'conmebol.libertadores',
  'conmebol.sudamericana', 'fifa.worldq.conmebol', 'fifa.worldq.uefa', 'conmebol.america', 'fifa.friendly', 'fifa.world',
  'bra.copa_do_brazil', 'uefa.euro', 'all'];
const days = ['20261104', '20261105', '20261112', '20261113', '20261114', '20261117'];
async function get(u) {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA } });
    const t = await r.text();
    let n = '?', lg = '';
    try { const j = JSON.parse(t); n = j.events?.length ?? `sem events (${j.message || Object.keys(j)})`; lg = j.leagues?.[0]?.name || ''; 
      if (j.events?.[0]) lg += ` | ex: ${j.events[0].name} ${j.events[0].date}`; } catch {}
    return `HTTP ${r.status} eventos=${n} ${lg}`;
  } catch (e) { return `ERRO ${e.message}`; }
}
for (const c of codes) {
  const res = [];
  for (const d of days) res.push(`${d.slice(6)}:${(await get(`${BASE}/${c}/scoreboard?dates=${d}&lang=pt&region=br`)).split(' ')[1]}`);
  console.log(c.padEnd(24), res.join(' '));
  console.log(''.padEnd(24), await get(`${BASE}/${c}/scoreboard?dates=20261112&lang=pt&region=br`));
}
console.log('\n--- períodos ---');
for (const r of ['20261104-20261105', '20261104-20261110', '20261104-20261118']) {
  console.log(r, await get(`${BASE}/eng.1/scoreboard?dates=${r}`));
  console.log(r, 'limit', await get(`${BASE}/eng.1/scoreboard?dates=${r}&limit=100`));
}
console.log('calendar', await get(`${BASE}/eng.1/scoreboard?calendar=whitelist`));
console.log('sem data', await get(`${BASE}/eng.1/scoreboard`));
console.log('all hoje', await get(`${BASE}/all/scoreboard?dates=20261104`));
