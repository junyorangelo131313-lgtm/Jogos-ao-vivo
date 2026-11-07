// Sonda: que zonas (note) a ESPN manda na classificação de cada liga, e em que posições.
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36';
const B = 'https://site.api.espn.com/apis/v2/sports/soccer';
for (const lg of ['bra.1', 'arg.1', 'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'por.1']) {
  const j = await (await fetch(`${B}/${lg}/standings?lang=pt&region=br`, { headers: { 'User-Agent': UA } })).json();
  const groups = j.children?.length ? j.children : [j];
  for (const g of groups) {
    const es = g.standings?.entries || [];
    const rank = (e) => (e.stats || []).find((s) => s.name === 'rank')?.value;
    const zones = new Map();
    for (const e of es) {
      const k = e.note ? `${e.note.color}|${e.note.description}|rank=${e.note.rank}` : 'SEM NOTE';
      if (!zones.has(k)) zones.set(k, []);
      zones.get(k).push(rank(e));
    }
    console.log(`\n== ${lg} grupo "${g.name || g.abbreviation || ''}" equipas=${es.length} season=${j.seasons?.[0]?.year ?? g.standings?.season ?? ''}`);
    for (const [k, rs] of zones) console.log(`  ${k}  posições: ${rs.sort((a, b) => a - b).join(',')}`);
  }
}
