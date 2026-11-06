// Times favoritos: aparecem em destaque (dourado e ★) e recebem aviso antes do jogo.
// Guardados no telemóvel. Por defeito: Santos.
const KEY = 'jogos-ao-vivo:favoritos:v1';
const DEFAULT = [{ id: null, name: 'Santos' }];

export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();

let list = load();

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (Array.isArray(v)) return v.filter((f) => f && f.name);
  } catch { /* sem armazenamento */ }
  return DEFAULT.map((f) => ({ ...f }));
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* sem armazenamento */ }
}

/** Para os testes: começa com uma lista dada. */
export function _set(v) { list = v; }

export const all = () => list.slice();

/** O time (objeto {id, name}) é favorito? Compara pelo código da ESPN ou pelo nome. */
export function isFavTeam(team) {
  if (!team) return false;
  const n = norm(team.name);
  return list.some((f) => sameTeam(f, team, n));
}

function sameTeam(f, team, n = norm(team.name)) {
  if (f.id && team.id) return String(f.id) === String(team.id);
  const fn = norm(f.name);
  // Sem código: aceita o nome com um sufixo (ex.: "Santos" = "Santos FC").
  return fn === n || ` ${n} `.includes(` ${fn} `);
}

/** Pelo nome apenas (ex.: classificação). */
export const isFavName = (name) => isFavTeam({ name });

export const isFavMatch = (m) => isFavTeam(m.home) || isFavTeam(m.away);

/** Liga/desliga um time. Devolve true se ficou favorito. */
export function toggle(team) {
  if (isFavTeam(team)) {
    list = list.filter((f) => !sameTeam(f, team));
    save();
    return false;
  }
  list = [...list, { id: team.id || null, name: team.name }];
  save();
  return true;
}

/** Guarda o código da ESPN dos favoritos que só têm nome (fica mais certeiro). */
export function learnIds(matches) {
  let changed = false;
  for (const f of list) {
    if (f.id) continue;
    for (const m of matches) {
      for (const t of [m.home, m.away]) {
        if (t?.id && norm(t.name) === norm(f.name)) { f.id = t.id; changed = true; }
      }
      if (f.id) break;
    }
  }
  if (changed) save();
}
