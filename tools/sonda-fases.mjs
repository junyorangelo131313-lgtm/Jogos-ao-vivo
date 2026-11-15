// Sonda: a ESPN indica a fase (oitavas, quartas…) dos jogos das taças?
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36';
const B = 'https://site.web.api.espn.com/apis/site/v2/sports/soccer';
const cut = (o, n = 400) => JSON.stringify(o)?.slice(0, n);
for (const [lg, dates] of [['fra.coupe_de_france', ['20261114', '20261115', '20250205', '20250402', '20250524']],
  ['esp.copa_del_rey', ['20250226', '20250426']], ['bra.copa_do_brazil', ['20261105']], ['por.taca.portugal', ['20261121']]]) {
  for (const d of dates) {
    const j = await (await fetch(`${B}/${lg}/scoreboard?dates=${d}&lang=pt&region=br`, { headers: { 'User-Agent': UA } })).json().catch(() => ({}));
    const ev = j.events?.[0];
    if (!ev) { console.log(lg, d, 'sem jogos'); continue; }
    const c = ev.competitions?.[0] || {};
    console.log(`\n${lg} ${d} jogos=${j.events.length} | ${ev.name}`);
    console.log('  event.week:', cut(ev.week), '| season:', cut(ev.season), '| event.type?', cut(ev.type));
    console.log('  comp.type:', cut(c.type), '| notes:', cut(c.notes), '| altGameNote:', cut(c.altGameNote), '| series:', cut(c.series, 200));
    console.log('  leagues[0].calendar[?] sample:', cut(j.leagues?.[0]?.calendar?.slice?.(0, 3), 300));
  }
}
