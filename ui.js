// UI helpers für Spieler + Spielplan + Ergebnis-Modal
// Erwartet global: firebase, db (firebase.firestore()), ggf. app.js initialisiert vor diesem Script.

(() => {
  let currentSeason = null;
  let currentUser = null;
  let isAdmin = false;
  let matchesUnsub = null;
  let usersCache = new Map();

  // DOM refs
  const playersEl = () => document.getElementById('player-select');
  const seasonInfoEl = () => document.getElementById('season-info');
  const matchesListEl = () => document.getElementById('matches-list');
  const standingsEl = () => document.getElementById('standings');
  const modal = () => document.getElementById('match-modal');

  const init = async () => {
    // wait until firebase is present
    if (!window.firebase || !window.db) {
      console.error('firebase or db not found. Stelle sicher, dass Firebase vor ui.js geladen ist.');
      return;
    }

    // Auth state
    firebase.auth().onAuthStateChanged(async u => {
      currentUser = u;
      await checkAdmin();
      await loadCurrentSeason();
      await loadPlayers();
      subscribeMatches(); // live updates
    });

    // Buttons
    document.getElementById('btn-refresh').addEventListener('click', async () => {
      await loadPlayers(); await loadCurrentSeason();
    });

    document.getElementById('btn-signout').addEventListener('click', () => firebase.auth().signOut());

    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);

    // result form
    document.getElementById('result-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      await submitResult();
    });

    // generate button stays (your generate-schedule handler may already exist)
    // if not, you can attach a click handler here; we keep existing handler if present.
  };

  async function checkAdmin() {
    isAdmin = false;
    if (!currentUser) return;
    try {
      const uDoc = await db.collection('users').doc(currentUser.uid).get();
      const data = uDoc.exists ? uDoc.data() : null;
      isAdmin = !!(data && data.isAdmin);
    } catch (err) {
      console.warn('isAdmin check failed', err);
    }
  }

  async function loadPlayers() {
    const el = playersEl();
    el.innerHTML = '<div class="muted">Lade Spieler…</div>';
    try {
      const snap = await db.collection('users').orderBy('displayName').get();
      el.innerHTML = '';
      snap.forEach(doc => {
        const u = doc.data();
        usersCache.set(doc.id, u);
        const item = document.createElement('label');
        item.className = 'player-item';
        item.innerHTML = `
          <input type="checkbox" data-uid="${doc.id}">
          <div class="player-name">${escapeHtml(u.displayName || u.email || doc.id)}</div>
          <div class="muted" style="margin-left:auto">${u.isAdmin ? 'Admin' : ''}</div>
        `;
        el.appendChild(item);
      });
      if (snap.empty) el.innerHTML = '<div class="muted">Keine Spieler gefunden.</div>';
    } catch (err) {
      console.error('loadPlayers error', err);
      el.innerHTML = '<div class="muted">Fehler beim Laden der Spieler.</div>';
    }
  }

  async function loadCurrentSeason() {
    const el = seasonInfoEl();
    el.textContent = 'Lade Season…';
    try {
      const snap = await db.collection('seasons').orderBy('createdAt','desc').limit(1).get();
      if (snap.empty) {
        el.textContent = 'Keine Season vorhanden.';
        currentSeason = null;
        return;
      }
      const doc = snap.docs[0];
      currentSeason = { id: doc.id, ...doc.data() };
      const sd = currentSeason.startDate && currentSeason.startDate.toDate ? currentSeason.startDate.toDate().toLocaleDateString() : (currentSeason.startDate ? new Date(currentSeason.startDate).toLocaleDateString() : '—');
      el.innerHTML = `<strong>${escapeHtml(currentSeason.name || 'Season')}</strong> · Start ${sd} · Runde: ${currentSeason.roundLengthDays || 7} Tage`;
    } catch (err) {
      console.error('loadCurrentSeason error', err);
      el.textContent = 'Fehler beim Laden der Season.';
    }
  }

  function subscribeMatches() {
    if (matchesUnsub) matchesUnsub(); // unsubscribe old
    matchesListEl().innerHTML = '<div class="muted">Lade Matches…</div>';
    if (!currentSeason) {
      matchesListEl().innerHTML = '<div class="muted">Keine Season ausgewählt.</div>';
      return;
    }
    matchesUnsub = db.collection('matches')
      .where('seasonId','==', currentSeason.id)
      .orderBy('roundNumber','asc')
      .onSnapshot(snap => {
        renderMatches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, err => {
        console.error('matches onSnapshot error', err);
        matchesListEl().innerHTML = '<div class="muted">Fehler beim Laden der Matches.</div>';
      });
  }

  function renderMatches(matches) {
    const el = matchesListEl();
    el.innerHTML = '';
    if (!matches.length) { el.innerHTML = '<div class="muted">Keine Matches.</div>'; return; }

    matches.forEach(m => {
      const row = document.createElement('div');
      row.className = 'match-row';
      const dateStr = m.scheduledDate && m.scheduledDate.toDate ? m.scheduledDate.toDate().toLocaleDateString() : (m.scheduledDate ? new Date(m.scheduledDate).toLocaleDateString() : '');
      const homeName = usersCache.get(m.homeUserId)?.displayName || m.homeUserId;
      const awayName = usersCache.get(m.awayUserId)?.displayName || m.awayUserId;
      const score = (m.homeScore != null && m.awayScore != null) ? `${m.homeScore} : ${m.awayScore}` : '—';
      row.innerHTML = `
        <div class="match-left">
          <div class="match-players">
            <div class="player-name">${escapeHtml(homeName)}</div>
            <div class="muted">vs</div>
            <div class="player-name">${escapeHtml(awayName)}</div>
          </div>
          <div class="match-time muted">${escapeHtml(dateStr)} · R${m.roundNumber}</div>
        </div>
        <div class="match-actions">
          <div class="muted">${escapeHtml(score)}</div>
          <button class="btn" data-action="view" data-id="${m.id}">Details</button>
          ${canEditMatch(m) ? `<button class="btn btn-primary" data-action="result" data-id="${m.id}">Ergebnis</button>` : ''}
        </div>
      `;
      // actions
      row.querySelectorAll('button').forEach(b => {
        b.addEventListener('click', (ev) => {
          const id = ev.currentTarget.dataset.id;
          const action = ev.currentTarget.dataset.action;
          if (action === 'result') openResultModal(id);
          else openMatchDetails(id);
        });
      });
      el.appendChild(row);
    });
  }

  function canEditMatch(match) {
    if (!currentUser) return false;
    if (isAdmin) return true;
    const uid = currentUser.uid;
    return uid === match.homeUserId || uid === match.awayUserId;
  }

  async function openMatchDetails(matchId) {
    // simple details: show alert (could be enhanced)
    const doc = await db.collection('matches').doc(matchId).get();
    if (!doc.exists) { alert('Match nicht gefunden'); return; }
    const m = doc.data();
    alert(`Match: R${m.roundNumber}\n${usersCache.get(m.homeUserId)?.displayName || m.homeUserId} vs ${usersCache.get(m.awayUserId)?.displayName || m.awayUserId}\nDatum: ${m.scheduledDate && m.scheduledDate.toDate ? m.scheduledDate.toDate().toLocaleString() : ''}`);
  }

  let editingMatchId = null;
  async function openResultModal(matchId) {
    editingMatchId = matchId;
    const doc = await db.collection('matches').doc(matchId).get();
    if (!doc.exists) { alert('Match nicht gefunden'); return; }
    const m = doc.data();
    document.getElementById('modal-match-info').textContent = `R${m.roundNumber} — ${usersCache.get(m.homeUserId)?.displayName || m.homeUserId} vs ${usersCache.get(m.awayUserId)?.displayName || m.awayUserId}`;
    document.getElementById('home-score').value = m.homeScore != null ? m.homeScore : '';
    document.getElementById('away-score').value = m.awayScore != null ? m.awayScore : '';
    // show modal
    const md = modal();
    md.setAttribute('aria-hidden','false');
    md.style.display = 'flex';
  }

  function closeModal() {
    editingMatchId = null;
    const md = modal();
    md.setAttribute('aria-hidden','true');
    md.style.display = 'none';
  }

  async function submitResult() {
    if (!editingMatchId) return;
    const homeScore = parseInt(document.getElementById('home-score').value, 10);
    const awayScore = parseInt(document.getElementById('away-score').value, 10);
    if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
      alert('Bitte gültige Scores eingeben.');
      return;
    }
    try {
      await db.collection('matches').doc(editingMatchId).update({
        homeScore, awayScore, completed: true, resultUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      closeModal();
    } catch (err) {
      console.error('submitResult error', err);
      alert('Fehler beim Speichern: ' + (err.message || err));
    }
  }

  // util
  function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

  // start
  document.addEventListener('DOMContentLoaded', init);
})();
