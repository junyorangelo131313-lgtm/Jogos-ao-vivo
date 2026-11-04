// Guarda a agenda no próprio telemóvel, para abrir na hora e gastar poucos pedidos.
const KEY = 'jogos-ao-vivo:v2';

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && Array.isArray(s.matches)) return s;
  } catch { /* ignora cache estragado */ }
  return { matches: [], fetchedAt: 0, liveFetchedAt: 0, today: null };
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* sem espaço: segue sem cache */ }
}
