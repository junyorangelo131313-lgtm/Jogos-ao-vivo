// Tema da tela: 'auto' (segue o telemóvel), 'dark' (escuro) ou 'light' (claro).
// Carregado também como script normal no <head>, para aplicar o tema antes de
// a página aparecer (sem "piscar").
const THEME_KEY = 'jogos-ao-vivo:tema';
const THEMES = ['auto', 'dark', 'light'];

function readTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return THEMES.includes(t) ? t : 'auto';
  } catch { return 'auto'; }
}

function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0f1638' : '#eef2ff');
}

applyTheme(readTheme());
try {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(readTheme()));
} catch { /* WebView antigo */ }

globalThis.JogosTema = {
  get: readTheme,
  set(t) {
    if (!THEMES.includes(t)) return;
    try { localStorage.setItem(THEME_KEY, t); } catch { /* sem armazenamento: vale só nesta sessão */ }
    applyTheme(t);
  },
};
