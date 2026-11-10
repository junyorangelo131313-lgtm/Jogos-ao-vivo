// Sonda: confirma códigos de competições na ESPN (o nome devolvido mostra se o código existe).
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36';
const B = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const codes = ['ksa.1', 'usa.1', 'fifa.cwc', 'conmebol.recopa', 'bra.camp.paulista', 'bra.camp.carioca', 'bra.camp.mineiro',
  'bra.camp.gaucho', 'por.taca.portugal', 'esp.copa_del_rey', 'ita.coppa_italia', 'ger.dfb_pokal', 'codigo.invalido'];
for (const c of codes) {
  try {
    const r = await fetch(`${B}/${c}/scoreboard?lang=pt&region=br`, { headers: { 'User-Agent': UA } });
    const j = await r.json().catch(() => ({}));
    const lg = j.leagues?.[0];
    const cal = lg?.calendar?.length ? `${lg.calendar[0]?.startDate || lg.calendar[0]} → ${lg.calendar.at(-1)?.endDate || lg.calendar.at(-1)}` : '';
    console.log(`${c.padEnd(22)} HTTP ${r.status} | ${lg ? `${lg.name} (época ${lg.season?.year ?? '?'}) ${cal}` : `sem liga: ${JSON.stringify(j).slice(0, 120)}`} | eventos=${j.events?.length ?? '-'}`);
  } catch (e) { console.log(c, 'ERRO', e.message); }
}

// Servidor alternativo da ESPN: entrega também jogos (scoreboard) e detalhes (summary)?
const W = 'https://site.web.api.espn.com/apis/site/v2/sports/soccer';
const sb = await (await fetch(`${W}/eng.1/scoreboard?dates=20261108&lang=pt&region=br`, { headers: { 'User-Agent': UA } })).json().catch((e) => ({ erro: e.message }));
console.log(`\nservidor alternativo, scoreboard eng.1 08/11: eventos=${sb.events?.length ?? JSON.stringify(sb).slice(0, 150)}`);
const ev = sb.events?.[0];
if (ev) {
  const su = await (await fetch(`${W}/eng.1/summary?event=${ev.id}&lang=pt&region=br`, { headers: { 'User-Agent': UA } })).json().catch((e) => ({ erro: e.message }));
  console.log(`servidor alternativo, summary ${ev.name}: keyEvents=${su.keyEvents?.length ?? JSON.stringify(su).slice(0, 150)}`);
}
