// Minimal adapter (sicher) — fügt nur die Klasse .cls-shell hinzu, verschiebt keine Kinder.
// Lade diese Datei mit <script src="cls-theme-adapter.js" defer></script>

(function(){
  function applyScopedShell() {
    // prefer .container, fallback to #app or main or body
    var host = document.querySelector('.container') || document.querySelector('#app') || document.querySelector('main') || document.body;
    if (!host) {
      console.warn('CLS Theme: kein Host-Element gefunden (container / #app / main / body).');
      return;
    }
    // idempotent: nur Klasse setzen
    if (host.classList && host.classList.contains('cls-shell')) {
      console.log('CLS Theme: .cls-shell bereits gesetzt auf', host);
      return;
    }
    host.classList.add('cls-shell');
    console.log('CLS Theme: applied .cls-shell to', host);
  }

  // expose helper for SPAs
  window.__clsTheme = window.__clsTheme || {};
  window.__clsTheme.applyScopedShell = applyScopedShell;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyScopedShell, { once: true });
  } else {
    applyScopedShell();
  }
})();
