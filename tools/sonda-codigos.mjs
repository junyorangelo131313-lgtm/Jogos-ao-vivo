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
