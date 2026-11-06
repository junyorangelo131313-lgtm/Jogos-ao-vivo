// Sonda: mostra a estrutura do "summary" da ESPN (detalhes de um jogo) para escrever o leitor.
import { addDays, todayTomorrow } from '../www/js/time.js';
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36';
const B = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const j = async (u) => (await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json' } })).json();
const { today } = todayTomorrow();
const cut = (o, n = 1500) => JSON.stringify(o)?.slice(0, n);
for (const lg of ['eng.1', 'bra.1', 'arg.1']) {
  for (const k of [addDays(today, -1), addDays(today, -2), today]) {
    const sb = await j(`${B}/${lg}/scoreboard?dates=${k.replaceAll('-', '')}&lang=pt&region=br`);
    const ev = (sb.events || []).find((e) => e.status?.type?.state === 'post') || (sb.events || [])[0];
    if (!ev) continue;
    console.log(`\n===== ${lg} ${k} evento ${ev.id} ${ev.name} estado=${ev.status?.type?.state}`);
    console.log('scoreboard competitions[0] chaves:', Object.keys(ev.competitions?.[0] || {}).join(','));
    console.log('scoreboard details:', cut(ev.competitions?.[0]?.details, 1200));
    console.log('scoreboard venue:', cut(ev.competitions?.[0]?.venue, 300));
    const s = await j(`${B}/${lg}/summary?event=${ev.id}&lang=pt&region=br`);
    console.log('summary chaves:', Object.keys(s).join(','));
    console.log('keyEvents n=', s.keyEvents?.length, 'tipos=', [...new Set((s.keyEvents || []).map((e) => `${e.type?.type}|${e.type?.text}`))].join(' ; '));
    for (const e of (s.keyEvents || []).filter((e) => !/substitution|kickoff|halftime|end|start/i.test(e.type?.type || '')).slice(0, 4)) console.log('  keyEvent:', cut(e, 700));
    console.log('gameInfo:', cut(s.gameInfo, 600));
    console.log('header.competitions[0] chaves:', Object.keys(s.header?.competitions?.[0] || {}).join(','));
    console.log('header competitor[0]:', cut({ ...s.header?.competitions?.[0]?.competitors?.[0], team: { id: s.header?.competitions?.[0]?.competitors?.[0]?.team?.id, displayName: s.header?.competitions?.[0]?.competitors?.[0]?.team?.displayName } }, 500));
    console.log('header status:', cut(s.header?.competitions?.[0]?.status, 300));
    console.log('boxscore.teams[0] stats:', cut(s.boxscore?.teams?.[0]?.statistics?.map((x) => `${x.name}=${x.displayValue}|${x.label}`), 800));
    break;
  }
}
