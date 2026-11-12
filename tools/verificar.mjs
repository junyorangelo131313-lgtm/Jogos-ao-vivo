// Verificação diária: corre o mesmo código do app contra os sites reais.
// Se os jogos ou os canais deixarem de aparecer, termina com erro e o workflow
// "Verificação diária" abre um aviso (issue) no GitHub, que chega por e-mail.
// Uso: node tools/verificar.mjs
import { writeFileSync, appendFileSync } from 'node:fs';
import { DOMParser, NodeFilter } from 'linkedom';
import { LEAGUES } from '../www/js/leagues.js';
import { fetchEspn } from '../www/js/sources/espn.js';
import { fetchChannelsInfo } from '../www/js/channels.js';
import { getText } from '../www/js/http.js';
import { fetchDetails } from '../www/js/detalhes.js';
import { addDays, dayKey, todayTomorrow } from '../www/js/time.js';

// O app corre num navegador; aqui simulamos o necessário para ler o HTML do site de canais.
globalThis.DOMParser = DOMParser;
globalThis.NodeFilter = NodeFilter;

const out = [];
const problems = [];
const log = (s = '') => { out.push(s); console.log(s); };
const { today, tomorrow } = todayTomorrow();
log(`# Verificação do app Jogos ao Vivo — ${today}`);
log();

// 1) Jogos (ESPN)
log('## Jogos (ESPN)');
const matches = [];
const failed = [];
for (const l of LEAGUES) {
  try {
    const ms = await fetchEspn(l, addDays(today, -1), tomorrow); // ontem: para ter golos e detalhes a conferir
    matches.push(...ms);
    log(`- ✅ ${l.name}: ${ms.length} jogo(s)`);
  } catch (e) {
    failed.push(l.name);
    log(`- ❌ ${l.name}: ${e.message}`);
  }
}
if (failed.length > LEAGUES.length / 2) {
  problems.push(`A ESPN falhou em ${failed.length} de ${LEAGUES.length} competições.`);
}

// 1b) Quem marcou (vem na mesma lista da ESPN)
const withGoals = matches.filter((m) => m.score && m.score.home + m.score.away > 0);
const ok = withGoals.filter((m) => (m.goals || []).length);
log(`- Jogos com golos: ${withGoals.length}; com marcadores lidos: ${ok.length}`);
for (const m of ok.slice(0, 3)) log(`  - ${m.home.name} ${m.score.home}-${m.score.away} ${m.away.name}: ${m.goals.map((g) => `${g.player} ${g.minute}`).join(', ')}`);
if (withGoals.length >= 3 && !ok.length) problems.push('Os jogos têm golos mas os marcadores não foram lidos (a ESPN pode ter mudado o formato).');

// 2) Canais (duas fontes: futebolnatv.com.br e futebolaovivobrasil.com)
log();
log('## Canais de TV');
const near = matches.filter((m) => [today, tomorrow].includes(dayKey(new Date(m.start))) && m.state === 'pre');
try {
  const r = await fetchChannelsInfo(near);
  const ch = r.map, found = Object.keys(ch).length;
  log(`- Fonte 1 (futebolnatv.com.br): ${r.ok1 ? `${r.n1} jogos lidos, leitura por ${r.modo1}` : '❌ sem jogos'}`);
  log(`- Fonte 2 (futebolaovivobrasil.com): ${r.ok2 ? `${r.n2} jogos lidos` : '❌ sem jogos'}`);
  log(`- Jogos de hoje/amanhã por jogar: ${near.length}; com canal encontrado: ${found}`);
  for (const m of near.filter((x) => ch[x.id]).slice(0, 8)) log(`  - ${m.home.name} x ${m.away.name}: ${ch[m.id].join(', ')}`);
  // Só as ligas principais passam sempre na TV brasileira; taças pequenas (ex.: FA Cup) muitas vezes não.
  const MAIN = new Set(['bra', 'brb', 'ucl', 'uel', 'eng', 'esp', 'ita', 'ger', 'fra', 'por', 'lib', 'sud', 'cdb', 'arg']);
  const mainNear = near.filter((m) => MAIN.has(m.league));
  const mainFound = mainNear.filter((m) => ch[m.id]).length;
  log(`- Das ligas principais: ${mainNear.length} jogo(s), ${mainFound} com canal`);
  if (!r.ok1 && !r.ok2) { if (near.length) problems.push('Nenhum dos dois sites de canais trouxe jogos.'); }
  else {
    if (!r.ok1) problems.push('O primeiro site de canais (futebolnatv.com.br) não trouxe jogos: o app está só com a segunda fonte.');
    else if (r.modo1 === 'texto') problems.push('O primeiro site de canais mudou de formato: o app está a usar a leitura de reserva (por texto), menos fiável.');
    if (!r.ok2) problems.push('O segundo site de canais (futebolaovivobrasil.com) não trouxe jogos: o app está só com a primeira fonte.');
    if (mainNear.length >= 3 && mainFound === 0) problems.push('Os sites de canais responderam, mas nenhum canal foi encontrado nos jogos das ligas principais (podem ter mudado o layout).');
    // Com 8 ou mais jogos por jogar, menos de 30% com canal é sinal de leitura partida (o normal é 60–80%).
    if (near.length >= 8 && found / near.length < 0.3) problems.push(`Só ${found} de ${near.length} jogos de hoje/amanhã têm canal (menos de 30%): a leitura dos canais pode estar partida.`);
  }
} catch (e) {
  log(`- ❌ ${e.message}`);
  if (near.length) problems.push(`Sites de canais indisponíveis: ${e.message}`);
}

// 3) Detalhes de um jogo (golos e cartões)
log();
log('## Detalhes do jogo (ESPN)');
const sample = matches.find((m) => m.state === 'done' || m.state === 'live');
if (!sample) {
  log('- (sem jogos terminados ou a decorrer para testar)');
} else {
  try {
    const d = await fetchDetails(sample, LEAGUES.find((l) => l.key === sample.league), true);
    log(`- ✅ ${sample.home.name} x ${sample.away.name}: ${d.events.length} lance(s), ${d.stats.length} estatística(s)${d.venue ? `, ${d.venue}` : ''}`);
    if (sample.score && sample.score.home + sample.score.away > 0 && !d.events.some((e) => ['goal', 'pen', 'own'].includes(e.kind))) {
      problems.push('Os detalhes do jogo vieram sem golos num jogo com golos (a ESPN pode ter mudado o formato).');
    }
  } catch (e) {
    log(`- ❌ ${e.message}`);
    problems.push(`Detalhes do jogo indisponíveis: ${e.message}`);
  }
}

log();
if (problems.length) {
  log('## ⚠️ Problemas');
  for (const p of problems) log(`- ${p}`);
} else {
  log('## ✅ Tudo a funcionar');
}

writeFileSync('relatorio.md', `${out.join('\n')}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${out.join('\n')}\n`);
process.exit(problems.length ? 1 : 0);
