// Sonda: formato das escalações (rosters) no "summary" da ESPN.
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36';
const B = 'https://site.web.api.espn.com/apis/site/v2/sports/soccer';
const cut = (o, n = 600) => JSON.stringify(o)?.slice(0, n);
for (const [lg, d] of [['eng.1', '20261108'], ['bra.1', '20261105'], ['bra.1', '20261116']]) {
  const sb = await (await fetch(`${B}/${lg}/scoreboard?dates=${d}&lang=pt&region=br`, { headers: { 'User-Agent': UA } })).json();
  for (const ev of (sb.events || []).slice(0, 1)) {
    const s = await (await fetch(`${B}/${lg}/summary?event=${ev.id}&lang=pt&region=br`, { headers: { 'User-Agent': UA } })).json();
    console.log(`\n== ${lg} ${d} ${ev.name} estado=${ev.status?.type?.state} rosters=${s.rosters?.length}`);
    for (const r of s.rosters || []) {
      console.log(' chaves:', Object.keys(r).join(','), '| homeAway:', r.homeAway, '| formation:', cut(r.formation, 80), '| team:', r.team?.displayName, '| n=', r.roster?.length);
      console.log(' 1º:', cut(r.roster?.[0], 700));
      console.log(' suplente ex.:', cut((r.roster || []).find((p) => !p.starter), 400));
    }
  }
}
