// cls-theme-adapter.js
// Minimal adapter: setzt .cls-shell auf das vorhandene .container oder auf body.
// Lade diese Datei mit <script src="cls-theme-adapter.js" defer></script>

(function(){
  function applyScopedShell() {
    // prefer .container, fallback to #app or main or body
    var host = document.querySelector('.container') || document.querySelector('#app') || document.querySelector('main') || document.body;
    if (!host) {
      console.warn('CLS Theme: kein Host-Element gefunden (container / #app / main / body).');
      return;
    }
    // if host already has cls-shell, nothing to do
    if (host.classList && host.classList.contains('cls-shell')) {
      console.log('CLS Theme: .cls-shell bereits gesetzt auf', host);
      return;
    }
    // add class to host
    host.classList.add('cls-shell');

    // add inner helper wrapper if not present (optional)
    if (!host.querySelector('.cls-shell-inner')) {
      var inner = document.createElement('div');
      inner.className = 'cls-shell-inner';
      // move child nodes into inner to avoid breaking layout structure
      while (host.firstChild) inner.appendChild(host.firstChild);
      host.appendChild(inner);
    }

    console.log('CLS Theme: applied .cls-shell to', host);
  }

  // If your app dynamically replaces the container later (SPA), expose a reapply helper
  window.__clsTheme = window.__clsTheme || {};
  window.__clsTheme.applyScopedShell = applyScopedShell;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyScopedShell, { once: true });
  } else {
    applyScopedShell();
  }
})();
