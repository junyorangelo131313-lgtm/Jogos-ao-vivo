// Sonda: onde há informação de canais para os jogos de hoje/amanhã sem canal no site principal?
// Uso: node tools/sonda-canais.mjs   (corrido pelo workflow "Diagnóstico")
import { parseHTML } from 'linkedom';
import { LEAGUES } from '../www/js/leagues.js';
import { espnUrl, parseEspn } from '../www/js/sources/espn.js';
import { todayTomorrow } from '../www/js/time.js';
import { PAGES, normalize, teamScore, findChannels, bestBlock } from '../www/js/channels.js';

const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const get = async (url, accept = 'text/html') => {
  try { const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'pt-BR,pt;q=0.9' }, redirect: 'follow' }); return { status: r.status, url: r.url, body: await r.text() }; }
  catch (e) { return { status: 0, body: '', err: String(e?.cause?.message || e.message) }; }
};
const { today, tomorrow } = todayTomorrow();
console.log('Hoje', today, 'amanhã', tomorrow);

// 1) ESPN: que campos de transmissão vêm no placar (region=br)?
const jogos = [];
for (const l of LEAGUES) {
  for (const d of [today, tomorrow]) {
    const r = await get(espnUrl(l, d, d, true), 'application/json');
    let data; try { data = JSON.parse(r.body); } catch { continue; }
    const lidos = parseEspn(data, l);
    for (const ev of data.events || []) {
      const c = ev.competitions?.[0] || {}, m = lidos.find((x) => x.id === `espn:${ev.id}`);
      if (!m) continue;
      const b = (c.broadcasts || []).flatMap((x) => x.names || []), g = (c.geoBroadcasts || []).map((x) => `${x.media?.shortName}[${x.region || ''}/${x.type?.shortName || ''}/${x.market?.type || ''}]`);
      jogos.push({ ...m, liga: l.name, espnB: b, espnG: g, bc: c.broadcast || '' });
    }
  }
}
console.log(`\nESPN: ${jogos.length} jogos. Com broadcasts: ${jogos.filter((j) => j.espnB.length).length}; com geoBroadcasts: ${jogos.filter((j) => j.espnG.length).length}`);
for (const j of jogos.slice(0, 400)) if (j.espnB.length || j.espnG.length || j.bc) console.log(`  ${j.start.slice(5, 16)} ${j.liga} | ${j.home.name} x ${j.away.name} | broadcasts=${j.espnB.join(',')} | geo=${j.espnG.join(',')} | broadcast=${j.bc}`);

// 2) Site principal (futebolnatv): que jogos ficam sem canal e o que diz o bloco?
const blocosDe = (html) => {
  const { document } = parseHTML(html); const out = [];
  document.querySelectorAll('script,style,noscript,svg,head').forEach((e) => e.remove());
  for (const el of document.querySelectorAll('*')) {
    const extra = [...el.querySelectorAll('img,[title],[aria-label]')].map((i) => `${i.getAttribute('alt') || ''} ${i.getAttribute('title') || ''} ${i.getAttribute('aria-label') || ''}`).join(' ');
    const raw = `${el.textContent || ''} ${extra}`.replace(/\s+/g, ' ');
    if (raw.length < 8 || raw.length > 900) continue;
    if ((raw.match(/\b\d{1,2}[:h]\d{2}\b/g) || []).length !== 1) continue;
    out.push({ raw, text: normalize(raw) });
  }
  return out;
};
let blocos = [];
for (const u of PAGES) { const r = await get(u); console.log(`\n${u} → HTTP ${r.status} ${r.body.length}B ${r.err || ''}`); blocos = blocos.concat(blocosDe(r.body)); }
const sem = [];
for (const j of jogos) { const b = bestBlock(j, blocos); const ch = b ? findChannels(b.text) : []; if (!ch.length) sem.push({ j, b }); }
console.log(`Sem canal no site principal: ${sem.length} de ${jogos.length}`);
for (const { j, b } of sem.slice(0, 60)) console.log(`  ${j.start.slice(5, 16)} ${j.liga} | ${j.home.name} x ${j.away.name} | ${b ? 'BLOCO SEM CANAL CONHECIDO: ' + b.raw.slice(0, 260) : 'não está no site'}`);

// 3) Outras fontes: respondem? trazem os times dos jogos sem canal?
const OUTRAS = [
  'https://mantosdofutebol.com.br/guia-de-jogos-tv-hoje-ao-vivo/',
  'https://www.uol.com.br/esporte/futebol/central-de-jogos/',
  'https://ge.globo.com/agenda/',
  'https://www.terra.com.br/esportes/futebol/jogos-de-hoje/',
  'https://www.lance.com.br/onde-assistir',
  'https://onefootball.com/pt-br/jogos',
  'https://www.goal.com/br/not%C3%ADcias/futebol-programacao-jogos-tv-aberta-fechada-onde-assistir-online-app/1jf3cuk3yh5uz18j0s89y5od6w',
  'https://www.zerozero.pt/tv.php',
  'https://www.livesoccertv.com/pt/schedules/' + today + '/',
  'https://www.futebolaovivobrasil.com/',
];
for (const u of OUTRAS) {
  const r = await get(u);
  const txt = normalize(r.body.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' '));
  const acha = sem.filter(({ j }) => teamScore(j.home, txt) >= 1 && teamScore(j.away, txt) >= 1).map(({ j }) => `${j.home.name} x ${j.away.name}`);
  console.log(`\n${u}\n  HTTP ${r.status} ${r.body.length}B ${r.err || ''} | canais conhecidos no texto: ${findChannels(txt).length} | jogos "sem canal" que aparecem aqui: ${acha.length} ${acha.slice(0, 8).join('; ')}`);
  // amostra do texto à volta do primeiro jogo encontrado
  const p = sem.find(({ j }) => teamScore(j.home, txt) >= 1 && teamScore(j.away, txt) >= 1);
  if (p) { const k = normalize(p.j.home.name).split(' ').find((t) => t.length >= 4) || normalize(p.j.home.name); const i = txt.indexOf(k); console.log('  amostra:', txt.slice(Math.max(0, i - 150), i + 350)); }
}
