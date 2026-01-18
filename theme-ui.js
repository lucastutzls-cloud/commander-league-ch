// theme-ui.js — füllt user email in .user-pill und setzt logout handler
// Leg diese Datei in dasselbe Verzeichnis wie index.html und binde sie mit <script src="theme-ui.js" defer></script>

(function(){
  function initUserPill(){
    if(!window.firebase || !firebase.auth) {
      console.warn('Firebase Auth nicht gefunden.');
      return;
    }
    const pill = document.querySelector('.user-pill .email');
    const logoutBtn = document.querySelector('.btn-logout');

    firebase.auth().onAuthStateChanged(user => {
      if(user) {
        if(pill) pill.textContent = user.email || (user.displayName || 'Benutzer');
        if(logoutBtn) logoutBtn.style.display = 'inline-block';
      } else {
        if(pill) pill.textContent = 'nicht eingeloggt';
        if(logoutBtn) logoutBtn.style.display = 'none';
      }
    });

    if(logoutBtn){
      logoutBtn.addEventListener('click', async () => {
        try {
          await firebase.auth().signOut();
          // optional: redirect to login
          console.log('Logged out');
        } catch (e) { console.error('Logout failed', e); }
      });
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initUserPill, { once:true });
  } else initUserPill();
})();
