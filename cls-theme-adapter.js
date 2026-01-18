// cls-theme-adapter.js (angepasst für #cls-app)
// Fügt nur die Klasse .cls-shell zu #cls-app hinzu (idempotent).
(function(){
  function applyScopedShell() {
    // prefer explicit #cls-app first (your project uses it), else fallbacks
    var host = document.getElementById('cls-app') || document.querySelector('.container') || document.querySelector('#app') || document.querySelector('main') || document.body;
    if (!host) {
      console.warn('CLS Theme: kein Host-Element gefunden (cls-app / container / #app / main / body).');
      return;
    }
    if (host.classList && host.classList.contains('cls-shell')) {
      console.log('CLS Theme: .cls-shell bereits gesetzt auf', host);
      return;
    }
    host.classList.add('cls-shell');
    console.log('CLS Theme: applied .cls-shell to', host);
  }

  // expose helper for SPA / manual reapply
  window.__clsTheme = window.__clsTheme || {};
  window.__clsTheme.applyScopedShell = applyScopedShell;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyScopedShell, { once: true });
  } else {
    applyScopedShell();
  }
})();
