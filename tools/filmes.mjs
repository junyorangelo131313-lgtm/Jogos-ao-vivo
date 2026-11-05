// Gera filmes.json: ~20 filmes e séries recentes e bem avaliados, escolhidos para o gosto do
// utilizador (roubos/golpes, hackers e tecnologia, estratégia, espionagem e guerra).
// Corre no GitHub Actions uma vez por dia (workflow "Filmes"), com a chave do TMDB em Secrets.
// O app só descarrega o ficheiro pronto, por isso o telemóvel não gasta consultas nem precisa de chave.
//
// Uso: TMDB_TOKEN=... node tools/filmes.mjs saida/filmes.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const TOKEN = (process.env.TMDB_TOKEN || '').trim();
const OUT = process.argv[2] || 'filmes.json';
const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/w342';
const TOTAL = 20;

if (!TOKEN) {
  console.log('::notice::Secret TMDB_TOKEN não definido: a lista de filmes não foi gerada.');
  process.exit(0);
}

// A chave pode ser a "API Key" (curta, v3) ou o "API Read Access Token" (longo, v4).
const useBearer = TOKEN.length > 40;

async function tmdb(path, params = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, v);
  if (!useBearer) url.searchParams.set('api_key', TOKEN);
  const headers = { Accept: 'application/json' };
  if (useBearer) headers.Authorization = `Bearer ${TOKEN}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { headers });
    if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 1500 * (attempt + 1))); continue; }
    if (!r.ok) throw new Error(`TMDB HTTP ${r.status} em ${path}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
  throw new Error(`TMDB: demasiados pedidos em ${path}`);
}

const iso = (d) => d.toISOString().slice(0, 10);
const now = new Date();
const daysAgo = (n) => iso(new Date(now.getTime() - n * 864e5));
const today = iso(now);

// Temas do gosto do utilizador → palavras-chave do TMDB (em inglês) e etiqueta mostrada no app.
const THEMES = [
  { tag: 'Roubo', bonus: 1.4, words: ['heist', 'bank robbery', 'jewel heist', 'robbery', 'art theft', 'thief'] },
  { tag: 'Golpe', bonus: 1.2, words: ['con artist', 'con man', 'swindle', 'mastermind'] },
  { tag: 'Hacker', bonus: 1.2, words: ['hacker', 'hacking', 'cyber crime', 'artificial intelligence'] },
  { tag: 'Espionagem', bonus: 0.9, words: ['spy', 'espionage', 'secret agent'] },
  { tag: 'Estratégia', bonus: 0.9, words: ['strategy', 'chess', 'cat and mouse', 'plan gone wrong'] },
  { tag: 'Guerra', bonus: 0.9, words: ['war', 'world war ii', 'military', 'soldier', 'battle'] },
];

async function keywordIds() {
  const map = new Map(); // id → tema
  for (const t of THEMES) {
    for (const w of t.words) {
      const r = await tmdb('/search/keyword', { query: w });
      const hit = (r.results || []).find((k) => k.name.toLowerCase() === w) || (r.results || [])[0];
      if (hit && !map.has(hit.id)) map.set(hit.id, t);
    }
  }
  return map;
}

// Géneros do TMDB. Filmes: Ação 28, Crime 80, Mistério 9648, Ficção científica 878, Thriller 53, Guerra 10752.
// Séries: Ação e Aventura 10759, Crime 80, Mistério 9648, Ficção e Fantasia 10765, Guerra e Política 10768.
const MOVIE_GENRES = '28|80|9648|878|53|10752';
const TV_GENRES = '10759|80|9648|10765|10768';
const WAR = { movie: 10752, tv: 10768 };

async function discover(type, extra, pages = 2) {
  const out = [];
  const dateGte = type === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte';
  const dateLte = type === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte';
  for (let page = 1; page <= pages; page++) {
    const r = await tmdb(`/discover/${type}`, {
      language: 'pt-BR',
      sort_by: 'vote_average.desc',
      'vote_count.gte': type === 'movie' ? 120 : 60,
      'vote_average.gte': 6.5,
      [dateGte]: daysAgo(type === 'movie' ? 730 : 900),
      [dateLte]: today,
      include_adult: 'false',
      page,
      ...extra,
    });
    out.push(...(r.results || []).map((x) => ({ ...x, _type: type })));
    if (page >= (r.total_pages || 1)) break;
  }
  return out;
}

function score(x, themes) {
  const votes = x.vote_count || 0;
  const confidence = Math.min(1, Math.log10(Math.max(votes, 1)) / 3.3); // ~2000 votos = confiança total
  const date = x.release_date || x.first_air_date || '';
  const age = date ? (now - new Date(date)) / 864e5 : 999;
  const recent = age < 90 ? 0.8 : age < 180 ? 0.5 : age < 365 ? 0.25 : 0;
  const themeBonus = Math.max(0, ...themes.map((t) => t.bonus));
  return (x.vote_average || 0) * confidence + themeBonus + recent;
}

function providers(wp) {
  const pick = (c) => {
    const r = wp?.results?.[c];
    if (!r) return null;
    const names = (list) => [...new Set((list || []).map((p) => p.provider_name))].slice(0, 4);
    return { stream: names(r.flatrate), rent: names([...(r.rent || []), ...(r.buy || [])]) };
  };
  return { BR: pick('BR'), PT: pick('PT') };
}

async function main() {
  const kw = await keywordIds();
  const kwList = [...kw.keys()].join('|');
  const pool = new Map();
  const add = (list) => { for (const x of list) if (!pool.has(`${x._type}:${x.id}`)) pool.set(`${x._type}:${x.id}`, x); };

  add(await discover('movie', { with_keywords: kwList }, 3));       // filmes com os temas preferidos
  add(await discover('tv', { with_keywords: kwList }, 2));          // séries com os temas preferidos
  add(await discover('movie', { with_genres: MOVIE_GENRES }, 3));   // bons filmes dos géneros escolhidos
  add(await discover('tv', { with_genres: TV_GENRES }, 2));         // boas séries dos géneros escolhidos
  add(await discover('movie', { with_genres: String(WAR.movie) }, 1)); // garantir filmes de guerra
  console.log(`Candidatos: ${pool.size}`);

  // Detalhes (palavras-chave reais, duração, onde assistir) só dos ~45 melhores à partida.
  const pre = [...pool.values()].sort((a, b) => score(b, []) - score(a, [])).slice(0, 45);
  const detailed = [];
  for (const x of pre) {
    const d = await tmdb(`/${x._type}/${x.id}`, { language: 'pt-BR', append_to_response: 'keywords,watch/providers' });
    const kws = d.keywords?.keywords || d.keywords?.results || [];
    const themes = [...new Set(kws.map((k) => kw.get(k.id)).filter(Boolean))];
    const genres = (d.genres || []).map((g) => g.name);
    const isWar = (d.genres || []).some((g) => g.id === WAR[x._type]);
    if (isWar && !themes.some((t) => t.tag === 'Guerra')) themes.push(THEMES.find((t) => t.tag === 'Guerra'));
    let overview = d.overview;
    if (!overview) overview = (await tmdb(`/${x._type}/${x.id}`, { language: 'en-US' })).overview || '';
    detailed.push({
      key: `${x._type}:${x.id}`,
      type: x._type === 'movie' ? 'Filme' : 'Série',
      title: d.title || d.name,
      original: d.original_title || d.original_name,
      date: d.release_date || d.first_air_date || '',
      rating: Math.round((d.vote_average || 0) * 10) / 10,
      votes: d.vote_count || 0,
      genres: genres.slice(0, 3),
      tags: themes.map((t) => t.tag),
      runtime: d.runtime || d.episode_run_time?.[0] || null,
      seasons: d.number_of_seasons || null,
      overview: overview.length > 420 ? `${overview.slice(0, 417).trim()}…` : overview,
      poster: d.poster_path ? IMG + d.poster_path : null,
      where: providers(d['watch/providers']),
      link: `https://www.themoviedb.org/${x._type}/${x.id}`,
      _score: score(d, themes),
    });
  }

  // Escolha final: os melhores pela pontuação, com variedade (filmes e séries, e alguns de guerra).
  detailed.sort((a, b) => b._score - a._score);
  const chosen = [];
  const count = (f) => chosen.filter(f).length;
  for (const x of detailed) {
    if (chosen.length >= TOTAL) break;
    if (x.type === 'Série' && count((c) => c.type === 'Série') >= 7) continue;
    chosen.push(x);
  }
  for (const x of detailed) { // pelo menos 3 de guerra, se houver
    if (count((c) => c.tags.includes('Guerra')) >= 3) break;
    if (!x.tags.includes('Guerra') || chosen.includes(x)) continue;
    // troca pelo pior escolhido que não seja de guerra
    let worst = -1;
    for (let i = chosen.length - 1; i >= 0; i--) if (!chosen[i].tags.includes('Guerra')) { worst = i; break; }
    if (chosen.length < TOTAL) chosen.push(x);
    else if (worst >= 0) chosen.splice(worst, 1, x);
  }
  chosen.sort((a, b) => b._score - a._score);

  const items = chosen.map(({ _score, ...x }, i) => ({ rank: i + 1, ...x }));
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), source: 'TMDB', items }, null, 1));
  console.log(`Guardado ${OUT} com ${items.length} títulos:`);
  for (const x of items) console.log(`${String(x.rank).padStart(2)}. ★${x.rating} ${x.type} ${x.title} (${x.date.slice(0, 4)}) [${x.tags.join(', ')}] BR:${x.where.BR?.stream?.join('/') || '-'}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
