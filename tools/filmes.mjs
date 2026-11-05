// Gera filmes.json: ~20 filmes e séries recentes e bem avaliados, escolhidos para o gosto do
// utilizador (roubos/golpes, hackers e tecnologia, estratégia, espionagem e guerra).
// Corre no GitHub Actions uma vez por dia (workflow "Filmes"). NÃO precisa de conta nem de chave:
//   - IMDb (ficheiros públicos diários): nota de 0 a 10, votos, géneros e ano
//   - Wikidata: título em português, géneros detalhados (ex.: "heist film") e plataforma
//   - Wikipédia (pt, ou en se não houver): resumo e imagem
// O app só descarrega o ficheiro pronto.
//
// Uso: node tools/filmes.mjs saida/filmes.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';

const OUT = process.argv[2] || 'filmes.json';
const TOTAL = 20;
const UA = 'JogosAoVivo/1.0 (app pessoal; https://github.com/junyorangelo131313-lgtm/Jogos-ao-vivo)';
const YEAR = new Date().getUTCFullYear();

const TYPES = { movie: 'Filme', tvSeries: 'Série', tvMiniSeries: 'Série' };
const TASTE = ['Crime', 'Thriller', 'War', 'Action', 'Sci-Fi', 'Mystery'];
const EXCLUDE = ['Animation', 'Family', 'Horror', 'Musical', 'Reality-TV', 'Talk-Show', 'Game-Show', 'Documentary', 'News'];
const GENRE_PT = {
  Action: 'Ação', Adventure: 'Aventura', Biography: 'Biografia', Comedy: 'Comédia', Crime: 'Crime', Drama: 'Drama',
  Fantasy: 'Fantasia', History: 'História', Mystery: 'Mistério', 'Sci-Fi': 'Ficção científica', Thriller: 'Suspense',
  War: 'Guerra', Western: 'Faroeste', Sport: 'Desporto', Romance: 'Romance',
};

// Temas do gosto do utilizador: procurados nos géneros do Wikidata e no resumo da Wikipédia.
const THEMES = [
  { tag: 'Roubo', bonus: 1.4, re: /heist|caper|robbery|roubo|assalto|ladr[aã]o|thief|jewel|joia/i },
  { tag: 'Golpe', bonus: 1.1, re: /con artist|swindl|golpe|golpista|vigarista|scam/i },
  { tag: 'Hacker', bonus: 1.1, re: /hacker|cyber|ciber|techno-thriller|intelig[eê]ncia artificial|artificial intelligence/i },
  { tag: 'Espionagem', bonus: 0.9, re: /\bspy\b|espionage|espi[aã]o|espionagem|\bCIA\b|\bMI6\b|secret agent|agente secreto/i },
  { tag: 'Estratégia', bonus: 0.8, re: /strateg|estrat[eé]gi|xadrez|chess|mastermind|plano perfeito|cat-and-mouse/i },
  { tag: 'Guerra', bonus: 0.9, re: /\bwar film\b|war drama|guerra|\bwar\b|military|militar|soldad|soldier/i },
];

// Plataformas de streaming conhecidas (nomes como aparecem no Wikidata → nome mostrado).
const PLATFORMS = [
  [/netflix/i, 'Netflix'], [/amazon|prime video/i, 'Prime Video'], [/apple/i, 'Apple TV+'], [/disney/i, 'Disney+'],
  [/\bhbo\b|\bmax\b/i, 'Max'], [/paramount/i, 'Paramount+'], [/globoplay/i, 'Globoplay'], [/hulu/i, 'Disney+'],
];

async function get(url, opts = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
    if (r.status === 429 || r.status >= 500) { await new Promise((ok) => setTimeout(ok, 2000 * (attempt + 1))); continue; }
    return r;
  }
  throw new Error(`demasiadas tentativas: ${url}`);
}

async function* tsv(url) {
  const r = await get(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  const lines = createInterface({ input: Readable.fromWeb(r.body).pipe(createGunzip()), crlfDelay: Infinity });
  let first = true;
  for await (const line of lines) {
    if (first) { first = false; continue; }
    yield line.split('\t');
  }
}

/** 1) IMDb: notas e candidatos. */
async function imdbCandidates() {
  const ratings = new Map();
  for await (const [id, avg, votes] of tsv('https://datasets.imdbws.com/title.ratings.tsv.gz')) {
    const v = Number(votes);
    if (v >= 1500) ratings.set(id, [Number(avg), v]);
  }
  console.log(`IMDb: ${ratings.size} títulos com 1500+ votos`);
  const out = [];
  for await (const [id, type, primary, original, adult, start, , minutes, genres] of tsv('https://datasets.imdbws.com/title.basics.tsv.gz')) {
    const kind = TYPES[type];
    if (!kind || adult === '1') continue;
    const year = Number(start);
    if (!year || year > YEAR || year < YEAR - (kind === 'Série' ? 2 : 1)) continue;
    const r = ratings.get(id);
    if (!r) continue;
    const [rating, votes] = r;
    const g = genres === '\\N' ? [] : genres.split(',');
    if (!g.some((x) => TASTE.includes(x)) || g.some((x) => EXCLUDE.includes(x))) continue;
    if (rating < 6.8 || votes < (kind === 'Série' ? 2000 : 4000)) continue;
    out.push({ id, kind, title: primary, original, year, rating, votes, genres: g, runtime: minutes === '\\N' ? null : Number(minutes) });
  }
  console.log(`IMDb: ${out.length} candidatos (${YEAR - 2}–${YEAR}, géneros do gosto, nota ≥ 6,8)`);
  return out;
}

function baseScore(x) {
  const confidence = Math.min(1, Math.log10(x.votes) / 4.3); // ~20 000 votos = confiança total
  const recent = x.year === YEAR ? 0.6 : x.year === YEAR - 1 ? 0.3 : 0;
  const war = x.genres.includes('War') ? 0.5 : 0;
  const crimeThriller = x.genres.includes('Crime') && x.genres.includes('Thriller') ? 0.4 : 0;
  return x.rating * confidence + recent + war + crimeThriller;
}

/** 2) Wikidata: título em português, géneros detalhados, plataforma e páginas da Wikipédia. */
async function wikidata(ids) {
  const map = new Map();
  for (let i = 0; i < ids.length; i += 40) {
    const values = ids.slice(i, i + 40).map((id) => `"${id}"`).join(' ');
    const q = `SELECT ?imdb ?ptbr ?pt ?ptwiki ?enwiki
      (GROUP_CONCAT(DISTINCT ?gl; separator="|") AS ?genres) (GROUP_CONCAT(DISTINCT ?nl; separator="|") AS ?nets) WHERE {
      VALUES ?imdb { ${values} }
      ?item wdt:P345 ?imdb .
      OPTIONAL { ?item rdfs:label ?ptbr FILTER(LANG(?ptbr) = "pt-br") }
      OPTIONAL { ?item rdfs:label ?pt FILTER(LANG(?pt) = "pt") }
      OPTIONAL { ?ptwiki schema:about ?item; schema:isPartOf <https://pt.wikipedia.org/> }
      OPTIONAL { ?enwiki schema:about ?item; schema:isPartOf <https://en.wikipedia.org/> }
      OPTIONAL { ?item wdt:P136 ?g . ?g rdfs:label ?gl FILTER(LANG(?gl) = "en") }
      OPTIONAL { { ?item wdt:P449 ?n } UNION { ?item wdt:P750 ?n } ?n rdfs:label ?nl FILTER(LANG(?nl) = "en") }
    } GROUP BY ?imdb ?ptbr ?pt ?ptwiki ?enwiki`;
    const r = await get(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { Accept: 'application/sparql-results+json' } });
    if (!r.ok) { console.warn(`Wikidata HTTP ${r.status}`); continue; }
    const j = await r.json();
    for (const b of j.results.bindings) {
      const v = (k) => b[k]?.value || '';
      if (map.has(v('imdb'))) continue;
      map.set(v('imdb'), {
        ptTitle: v('ptbr') || v('pt'),
        ptwiki: v('ptwiki'), enwiki: v('enwiki'),
        genres: v('genres').split('|').filter(Boolean),
        nets: v('nets').split('|').filter(Boolean),
      });
    }
  }
  console.log(`Wikidata: ${map.size} de ${ids.length} encontrados`);
  return map;
}

/** 3) Wikipédia: resumo e imagem. */
async function summary(pageUrl) {
  if (!pageUrl) return null;
  const u = new URL(pageUrl);
  const title = decodeURIComponent(u.pathname.replace('/wiki/', ''));
  const r = await get(`${u.origin}/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  if (!r.ok) return null;
  const j = await r.json();
  return { text: j.extract || '', image: j.thumbnail?.source || j.originalimage?.source || null, title: j.title || title };
}

const cleanTitle = (t) => String(t || '').replace(/\s*\((filme|série|serie|minissérie|film|tv series|miniseries)[^)]*\)\s*$/i, '').trim();
const short = (t, n = 420) => (t.length > n ? `${t.slice(0, n - 3).trim()}…` : t);

async function main() {
  const cands = (await imdbCandidates()).map((x) => ({ ...x, _base: baseScore(x) })).sort((a, b) => b._base - a._base).slice(0, 80);
  const wd = await wikidata(cands.map((x) => x.id));

  const items = [];
  for (const x of cands) {
    const w = wd.get(x.id) || { genres: [], nets: [] };
    const pt = await summary(w.ptwiki);
    const en = pt?.text ? null : await summary(w.enwiki);
    const text = pt?.text || en?.text || '';
    const hay = `${w.genres.join(' ')} ${text} ${x.genres.join(' ')}`;
    const themes = THEMES.filter((t) => t.re.test(hay));
    const nets = [...new Set(w.nets.map((n) => PLATFORMS.find(([re]) => re.test(n))?.[1]).filter(Boolean))];
    items.push({
      key: x.id,
      type: x.kind,
      title: cleanTitle(w.ptTitle || (w.ptwiki && pt?.title) || x.title),
      original: x.original,
      date: String(x.year),
      rating: x.rating,
      votes: x.votes,
      genres: x.genres.map((g) => GENRE_PT[g] || g).slice(0, 3),
      tags: themes.map((t) => t.tag),
      runtime: x.kind === 'Filme' ? x.runtime : null,
      seasons: null,
      overview: short(text),
      overviewLang: pt?.text ? 'pt' : en?.text ? 'en' : '',
      poster: pt?.image || en?.image || null,
      where: nets.length ? { ALL: { stream: nets } } : {},
      link: `https://www.imdb.com/title/${x.id}/`,
      _score: x._base + Math.max(0, ...themes.map((t) => t.bonus)),
    });
  }

  // Escolha final: os melhores, com variedade (no máximo 8 séries e pelo menos 3 de guerra, se houver).
  items.sort((a, b) => b._score - a._score);
  const chosen = [];
  for (const x of items) {
    if (chosen.length >= TOTAL) break;
    if (x.type === 'Série' && chosen.filter((c) => c.type === 'Série').length >= 8) continue;
    chosen.push(x);
  }
  for (const x of items) {
    if (chosen.filter((c) => c.tags.includes('Guerra')).length >= 3) break;
    if (!x.tags.includes('Guerra') || chosen.includes(x)) continue;
    let worst = -1;
    for (let i = chosen.length - 1; i >= 0; i--) if (!chosen[i].tags.includes('Guerra')) { worst = i; break; }
    if (chosen.length < TOTAL) chosen.push(x); else if (worst >= 0) chosen.splice(worst, 1, x);
  }
  chosen.sort((a, b) => b._score - a._score);

  const out = chosen.map(({ _score, ...x }, i) => ({ rank: i + 1, ...x }));
  if (out.length < 5) throw new Error(`só ${out.length} títulos: algo falhou nas fontes`);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), source: 'IMDb + Wikidata + Wikipédia', items: out }, null, 1));
  console.log(`Guardado ${OUT} com ${out.length} títulos:`);
  for (const x of out) {
    console.log(`${String(x.rank).padStart(2)}. ★${x.rating} ${x.type} ${x.title} (${x.date}) [${x.tags.join(', ')}] ` +
      `onde: ${x.where.ALL?.stream?.join('/') || '-'} | resumo: ${x.overviewLang || 'não'} | imagem: ${x.poster ? 'sim' : 'não'}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
