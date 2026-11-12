// Sonda: quantos jogos de hoje/amanhã ficam com canal só com a 1.ª fonte e com a 1.ª + 2.ª.
// Uso: node tools/sonda-canais.mjs   (corrido pelo workflow "Diagnóstico")
import { DOMParser, NodeFilter } from 'linkedom';
import { LEAGUES } from '../www/js/leagues.js';
import { espnUrl, parseEspn } from '../www/js/sources/espn.js';
import { todayTomorrow } from '../www/js/time.js';
import { PAGES, PAGE2, extractBlocks, extractBlocks2, bestBlock, findChannels } from '../www/js/channels.js';

globalThis.DOMParser = DOMParser; globalThis.NodeFilter = NodeFilter;
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const get = async (url, accept = 'text/html') => { const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'pt-BR,pt;q=0.9' } }); return r.text(); };
const { today, tomorrow } = todayTomorrow();
const jogos = [];
for (const l of LEAGUES) for (const d of [today, tomorrow]) {
  try { for (const m of parseEspn(JSON.parse(await get(espnUrl(l, d, d, true), 'application/json')), l)) if (!jogos.some((x) => x.id === m.id)) jogos.push({ ...m, liga: l.name }); } catch {}
}
const b1 = (await Promise.all(PAGES.map((u) => get(u).catch(() => '')))).flatMap((h) => extractBlocks(h));
const b2 = extractBlocks2(await get(PAGE2).catch(() => ''));
console.log(`Jogos: ${jogos.length} | blocos fonte 1: ${b1.length} | blocos fonte 2: ${b2.length}`);
let n1 = 0, n2 = 0;
for (const j of jogos) {
  const a = bestBlock(j, b1), c1 = a ? findChannels(a.text) : [];
  const b = bestBlock(j, b2), c2 = b ? findChannels(b.text) : [];
  if (c1.length) n1++; else if (c2.length) n2++;
  console.log(`${j.start.slice(5, 16)} ${j.liga.padEnd(24)} ${(j.home.name + ' x ' + j.away.name).padEnd(44)} F1: ${c1.join(', ') || '—'} | F2: ${c2.join(', ') || (b ? 'canal desconhecido: ' + b.raw.slice(0, 90) : '—')}`);
}
console.log(`\nCom canal pela fonte 1: ${n1} | só pela fonte 2: ${n2} | sem canal: ${jogos.length - n1 - n2} de ${jogos.length}`);
