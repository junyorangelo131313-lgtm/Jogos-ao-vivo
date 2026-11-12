// Sonda 2: HTML cru à volta de um jogo em cada fonte de canais (para escrever os leitores).
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const get = async (url) => { try { const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'pt-BR,pt;q=0.9' } }); return await r.text(); } catch (e) { return 'ERRO ' + e.message; } };
const FONTES = [
  ['https://www.futebolnatv.com.br/jogos-hoje/', ['Chipre', 'Operário']],
  ['https://www.futebolnatv.com.br/jogos-amanha/', ['Luxemburgo', 'Gibraltar']],
  ['https://mantosdofutebol.com.br/guia-de-jogos-tv-hoje-ao-vivo/', ['Chipre', 'Luxemburgo', 'Gibraltar']],
  ['https://www.futebolaovivobrasil.com/', ['Chipre', 'Luxemburgo', 'Gibraltar']],
];
for (const [u, chaves] of FONTES) {
  const h = await get(u);
  console.log(`\n\n================ ${u} (${h.length}B)`);
  for (const k of chaves) {
    const idx = []; let i = -1;
    while ((i = h.indexOf(k, i + 1)) >= 0 && idx.length < 40) idx.push(i);
    console.log(`\n--- "${k}": ${idx.length} ocorrências`);
    // a ocorrência com mais HTML "de jogo" à volta: mostra a 1.ª e a do meio
    for (const p of [...new Set([idx[0], idx[Math.floor(idx.length / 2)]])].filter((x) => x != null)) {
      console.log(`@${p}: ` + h.slice(Math.max(0, p - 900), p + 1500).replace(/\s+/g, ' '));
    }
  }
}
// datas presentes no guia do Mantos (cobre só hoje ou vários dias?)
const m = await get('https://mantosdofutebol.com.br/guia-de-jogos-tv-hoje-ao-vivo/');
console.log('\n\nMANTOS títulos de dia:', [...m.matchAll(/<(h[1-4]|strong)[^>]*>([^<]{0,80}(feira|Sábado|Domingo)[^<]{0,60})</gi)].map((x) => x[2].trim()).slice(0, 20));
const f = await get('https://www.futebolaovivobrasil.com/');
console.log('FAVB links de dias:', [...f.matchAll(/href="([^"]*(amanha|dia|data)[^"]*)"/gi)].map((x) => x[1]).slice(0, 15));
