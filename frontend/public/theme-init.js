/*
 * Applies the stored colour scheme before first paint.
 *
 * Without this the page paints light, then React adds .dark a frame later —
 * a visible white flash on every load for dark-mode users.
 *
 * This lives in public/ as a separate file rather than inline in index.html
 * on purpose: the SPA is served under a strict
 * `script-src 'self'` CSP (nginx/templates/kasms-locations.conf.template),
 * which blocks inline <script> outright. Keeping it external means the policy
 * does not have to be relaxed with 'unsafe-inline' — that would weaken XSS
 * protection across the whole app just to avoid a flash.
 *
 * Must stay render-blocking in <head>, above the stylesheet.
 * Keep in sync with src/context/ColorSchemeProvider.jsx (STORAGE_KEY, MODES).
 */
(function () {
  try {
    var saved = localStorage.getItem('kasms_color_scheme');
    var dark = saved === 'dark' || ((!saved || saved === 'system') &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch {
    /* private mode / blocked site data: fall through to light */
  }
})();
