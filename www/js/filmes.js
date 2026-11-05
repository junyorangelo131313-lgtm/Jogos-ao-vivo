// Separador "Filmes": lista de ~20 filmes e séries recomendados.
// A lista é escolhida uma vez por dia no GitHub (workflow "Filmes": IMDb + Wikidata + Wikipédia) e publicada
// num ficheiro. O app só descarrega esse ficheiro, no máximo de 12 em 12 horas.
import { getJson } from './http.js';

export const FILMES_URL = 'https://github.com/junyorangelo131313-lgtm/Jogos-ao-vivo/releases/download/filmes/filmes.json';
const KEY = 'jogos-ao-vivo:filmes:v1';
const MAX_AGE = 12 * 60 * 60 * 1000;

export function loadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (c && Array.isArray(c.items)) return c;
  } catch { /* cache estragado */ }
  return { items: [], updatedAt: null, fetchedAt: 0 };
}

export const isStale = (c, now = Date.now()) => !c.fetchedAt || now - c.fetchedAt > MAX_AGE;

export async function fetchFilmes() {
  const data = await getJson(FILMES_URL);
  if (!Array.isArray(data?.items)) throw new Error('lista de filmes inválida');
  const c = { items: data.items, updatedAt: data.updatedAt || null, fetchedAt: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* sem espaço */ }
  return c;
}

/** "Netflix · Prime Video" para o país; se não houver streaming, aluguer/compra. */
export function whereText(where) {
  if (where?.ALL?.stream?.length) return where.ALL.stream.join(', ');
  const parts = [];
  for (const [c, label] of [['BR', 'Brasil'], ['PT', 'Portugal']]) {
    const w = where?.[c];
    if (!w) continue;
    if (w.stream?.length) parts.push(`${label}: ${w.stream.join(', ')}`);
    else if (w.rent?.length) parts.push(`${label}: alugar em ${w.rent.slice(0, 2).join(', ')}`);
  }
  return parts.join(' · ');
}

/** Nota de 0 a 10 com uma casa decimal, à portuguesa ("8,1"). */
export const nota = (r) => (Math.round((r || 0) * 10) / 10).toFixed(1).replace('.', ',');
