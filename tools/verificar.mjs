// Verificação diária: corre o mesmo código do app contra os sites reais.
// Se os jogos ou os canais deixarem de aparecer, termina com erro e o workflow
// "Verificação diária" abre um aviso (issue) no GitHub, que chega por e-mail.
// Uso: node tools/verificar.mjs
import { writeFileSync, appendFileSync } from 'node:fs';
import { DOMParser, NodeFilter } from 'linkedom';
import { LEAGUES } from '../www/js/leagues.js';
import { fetchEspn } from '../www/js/sources/espn.js';
import { fetchChannels } from '../www/js/channels.js';
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

// 2) Canais (futebolnatv)
log();
log('## Canais de TV (futebolnatv.com.br)');
const near = matches.filter((m) => [today, tomorrow].includes(dayKey(new Date(m.start))) && m.state === 'pre');
try {
  const ch = await fetchChannels(near);
  const found = Object.keys(ch).length;
  log(`- Jogos de hoje/amanhã por jogar: ${near.length}; com canal encontrado: ${found}`);
  for (const m of near.filter((x) => ch[x.id]).slice(0, 8)) log(`  - ${m.home.name} x ${m.away.name}: ${ch[m.id].join(', ')}`);
  if (near.length >= 6 && found === 0) problems.push('O site de canais respondeu, mas nenhum canal foi encontrado (o site pode ter mudado o layout).');
} catch (e) {
  log(`- ❌ ${e.message}`);
  if (near.length) problems.push(`Site de canais indisponível: ${e.message}`);
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
