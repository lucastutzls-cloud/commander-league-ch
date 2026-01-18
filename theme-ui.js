// theme-ui.js
// Füllt die User‑Pill mit Firebase Auth user.email und bindet den Logout-Button.
// Lade diese Datei mit <script src="theme-ui.js" defer></script>
// Erwartet: firebase & firebase.auth() sind bereits initiiert (app.js geladen).

(function(){
  function initUserPill(){
    if (typeof window.firebase === 'undefined' || !firebase.auth) {
      console.warn('theme-ui: Firebase Auth nicht gefunden. Stelle sicher, dass firebase & app.js vor theme-ui.js geladen sind.');
      return;
    }

    // Query elements (existence optional)
    var pillEmailEl = document.querySelector('.user-pill .email') || document.querySelector('#logged-as') || null;
    var logoutBtn = document.querySelector('.btn-logout') || document.querySelector('#btn-signout') || null;

    // Set initial visibility
    if (logoutBtn) logoutBtn.style.display = 'none';

    // Observe auth state
    firebase.auth().onAuthStateChanged(function(user) {
      if (user) {
        var display = user.email || user.displayName || ('User ' + (user.uid ? user.uid.substring(0,6) : ''));
        if (pillEmailEl) {
          // if element is an input or simple element, set accordingly
          if ('value' in pillEmailEl) pillEmailEl.value = display;
          else pillEmailEl.textContent = display;
        }
        if (logoutBtn) logoutBtn.style.display = '';
      } else {
        if (pillEmailEl) {
          if ('value' in pillEmailEl) pillEmailEl.value = 'nicht eingeloggt';
          else pillEmailEl.textContent = 'nicht eingeloggt';
        }
        if (logoutBtn) logoutBtn.style.display = 'none';
      }
    });

    // Logout handler
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function(e){
        e.preventDefault();
        // Some UIs want a confirm — keep simple logout
        firebase.auth().signOut().then(function(){
          console.log('theme-ui: user logged out');
          // optional: redirect to /login or show a toast
        }).catch(function(err){
          console.error('theme-ui: logout failed', err);
          alert('Logout fehlgeschlagen: ' + (err && err.message ? err.message : err));
        });
      });
    }
  }

  // Auto-init after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUserPill, { once: true });
  } else {
    initUserPill();
  }
})();
