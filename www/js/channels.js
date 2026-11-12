// Canais de TV do Brasil, lidos do site futebolnatv.com.br e, para os jogos que ele não lista
// (ex.: seleções pequenas, taças estrangeiras), do site futebolaovivobrasil.com.
// O site não tem API, por isso lemos a página e procuramos, para cada jogo,
// o bloco de texto que tem os dois times (ou um time + a mesma hora de Brasília)
// e tiramos dali os nomes dos canais conhecidos.
import { getText } from './http.js';
import { hhmm, TZ_BR } from './time.js';

export const PAGES = [
  'https://www.futebolnatv.com.br/jogos-hoje/',
  'https://www.futebolnatv.com.br/jogos-amanha/',
];

// Segunda fonte: a página inicial traz os jogos de hoje e de amanhã numa tabela, com os canais em <li title="...">.
export const PAGE2 = 'https://www.futebolaovivobrasil.com/';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

// [nome mostrado, expressão procurada no texto já normalizado]
const KNOWN_CHANNELS = [
  ['Globo', /\b(tv )?globo\b/],
  ['SporTV', /\bsportv\b(?! ?\d)/],
  ['SporTV 2', /\bsportv ?2\b/],
  ['SporTV 3', /\bsportv ?3\b/],
  ['Premiere', /\bpremiere\b/],
  ['ESPN', /\bespn\b(?! ?\d)/],
  ['ESPN 2', /\bespn ?2\b/],
  ['ESPN 3', /\bespn ?3\b/],
  ['ESPN 4', /\bespn ?4\b/],
  ['ESPN 5', /\bespn ?5\b/],
  ['Disney+', /\bdisney\b/],
  ['Max', /\b(hbo )?max\b/],
  ['Prime Video', /\b(amazon )?prime video\b/],
  ['Paramount+', /\bparamount\b/],
  ['CazéTV', /\bcaze ?tv\b/],
  ['TNT', /\btnt\b/],
  ['Band', /\bband\b/],
  ['Record', /\brecord\b/],
  ['SBT', /\bsbt\b/],
  ['GOAT', /\bgoat\b/],
  ['Nosso Futebol', /\bnosso futebol\b/],
  ['DAZN', /\bdazn\b/],
  ['Xsports', /\bxsports\b/],
  ['Apple TV', /\bapple tv\b/],
  ['OneFootball', /\bonefootball\b/],
  ['YouTube', /\byoutube\b/],
];

// Palavras que não ajudam a distinguir times.
const STOP = new Set([
  'fc', 'cf', 'sc', 'ac', 'ec', 'se', 'cr', 'ca', 'afc', 'cd', 'ud', 'sd', 'rc', 'rcd', 'ssc', 'as', 'us',
  'club', 'clube', 'de', 'da', 'do', 'dos', 'das', 'del', 'la', 'le', 'the', 'and', 'e', 'vfb', 'vfl',
  'tsg', 'fk', 'sv', 'bk', 'calcio', 'futebol', 'football', 'futbol', 'sad', 'esporte',
]);

// Nomes em inglês/espanhol que o site brasileiro escreve de outra forma.
const ALIASES = {
  'bayern munich': 'bayern de munique',
  'inter milan': 'inter de milao',
  'internazionale': 'inter de milao',
  'ac milan': 'milan',
  'as roma': 'roma',
  'sporting cp': 'sporting',
  'sporting lisbon': 'sporting',
  'atletico madrid': 'atletico de madrid',
  'man united': 'manchester united',
  'man utd': 'manchester united',
  'man city': 'manchester city',
  'wolverhampton wanderers': 'wolves',
  'tottenham hotspur': 'tottenham',
  'brighton hove albion': 'brighton',
  'borussia monchengladbach': 'gladbach',
  'atletico mineiro': 'atletico mg',
  'athletico paranaense': 'athletico pr',
  'red bull bragantino': 'bragantino',
  'vasco da gama': 'vasco',
};

export function normalize(s) {
  return String(s || '')
    .replace(/\+/g, ' plus ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(name) {
  return normalize(name).split(' ').filter((t) => t.length >= 3 && !STOP.has(t));
}

/** Quanto (0 a 1) do nome de um time aparece no texto. Usa o melhor nome alternativo. */
export function teamScore(team, text) {
  const padded = ` ${text} `;
  const names = [team.name, ...(team.alt || [])];
  for (const n of [...names]) {
    const a = ALIASES[normalize(n)];
    if (a) names.push(a);
  }
  let best = 0;
  for (const n of names) {
    const tk = tokens(n);
    if (!tk.length) continue;
    const hit = tk.filter((t) => padded.includes(` ${t} `)).length;
    best = Math.max(best, hit / tk.length);
  }
  return best;
}

export function findChannels(text) {
  const found = [];
  for (const [label, re] of KNOWN_CHANNELS) if (re.test(text)) found.push(label);
  return found;
}

/** Escolhe o bloco de texto da página que corresponde a um jogo. */
export function bestBlock(match, blocks) {
  const brTime = hhmm(new Date(match.start), TZ_BR);
  const timeRe = new RegExp(`\\b${brTime.replace(':', '[ :h]')}\\b`);
  let best = null;
  for (const b of blocks) {
    const hs = teamScore(match.home, b.text);
    const as = teamScore(match.away, b.text);
    const time = timeRe.test(b.raw);
    const ok = (hs >= 0.5 && as >= 0.5) || (Math.max(hs, as) === 1 && time);
    if (!ok) continue;
    // Prefere o bloco que já inclui os canais (o "cartão" inteiro do jogo).
    const score = hs + as + (time ? 1 : 0) + (findChannels(b.text).length ? 0.5 : 0);
    if (!best || score > best.score || (score === best.score && b.text.length < best.len)) {
      best = { score, len: b.text.length, block: b };
    }
  }
  return best?.block || null;
}

const TIME_ANY = /\b\d{1,2}[:h]\d{2}\b/g;

/** Transforma o HTML da página em blocos de texto (um por elemento pequeno). */
export function extractBlocks(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript,svg,head').forEach((e) => e.remove());
  // Separa o texto de elementos vizinhos ("18:44<b>Santos</b>" -> "18:44 Santos").
  const walker = doc.createTreeWalker(doc.body || doc, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) n.data += ' ';
  const blocks = [];
  for (const el of doc.body ? doc.body.querySelectorAll('*') : []) {
    const extra = [...el.querySelectorAll('img,[title],[aria-label]')]
      .map((i) => `${i.getAttribute('alt') || ''} ${i.getAttribute('title') || ''} ${i.getAttribute('aria-label') || ''}`)
      .join(' ');
    const raw = `${el.textContent || ''} ${extra}`.replace(/\s+/g, ' ');
    if (raw.length < 8 || raw.length > 900) continue;
    const times = raw.match(TIME_ANY) || [];
    if (times.length !== 1) continue; // um bloco = um só jogo
    blocks.push({ raw, text: normalize(raw) });
  }
  return blocks;
}

const untag = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#8211;|&ndash;/g, '-').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

/** Segunda fonte: uma linha da tabela (<tr>) por jogo → blocos no mesmo formato de extractBlocks (sem DOM). */
export function extractBlocks2(html) {
  const blocks = [];
  for (const tr of String(html || '').split(/<tr[\s>]/i).slice(1)) {
    if (!/class="canales"/.test(tr)) continue;
    const hora = (tr.match(/class="hora[^"]*"[^>]*>\s*(\d{1,2}:\d{2})/) || [])[1];
    const lado = (c) => { const m = tr.match(new RegExp(`class="${c}"[\\s\\S]*?<span[^>]*title="([^"]+)"`)); return m ? m[1] : ''; };
    const nome = (tr.match(/itemprop="name" content="([^"]+)"/) || [])[1] || '';
    const lista = (tr.split(/class="listaCanales"/)[1] || '').split(/<\/ul>/)[0];
    const canais = [...lista.matchAll(/<li[^>]*title="([^"]+)"/g)].map((m) => m[1]);
    if (!hora || !canais.length) continue;
    const raw = untag(`${hora} ${lado('local')} ${lado('visitante')} ${nome.replace(' - ', ' ')} ${canais.join(' ')}`);
    blocks.push({ raw, text: normalize(raw) });
  }
  return blocks;
}

function assign(matches, blocks, map) {
  for (const m of matches) {
    if (map[m.id]) continue;
    const b = bestBlock(m, blocks);
    if (b) {
      const ch = findChannels(b.text);
      if (ch.length) map[m.id] = ch;
    }
  }
}

/** Devolve { idDoJogo: ['Canal', ...] } para os jogos encontrados. A segunda fonte só preenche os que a primeira não tem. */
export async function fetchChannels(matches) {
  const [p2, ...pages] = await Promise.allSettled([getText(PAGE2, BROWSER_HEADERS), ...PAGES.map((u) => getText(u, BROWSER_HEADERS))]);
  const blocks = pages.filter((p) => p.status === 'fulfilled').flatMap((p) => extractBlocks(p.value));
  const blocks2 = p2.status === 'fulfilled' ? extractBlocks2(p2.value) : [];
  if (!blocks.length && !blocks2.length) throw new Error('Sites de canais indisponíveis');
  const map = {};
  assign(matches, blocks, map);
  assign(matches, blocks2, map);
  return map;
}
