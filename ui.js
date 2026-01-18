// ui.js: UI + Player management + Matches + modals
// Requires firebase & window.db (firebase.firestore()) already initialized.

(() => {
  let currentSeason = null;
  let currentUser = null;
  let isAdmin = false;
  let matchesUnsub = null;
  let usersCache = new Map();

  // DOM refs
  const playersEl = () => document.getElementById('player-select');
  const manageEl = () => document.getElementById('player-management');
  const seasonInfoEl = () => document.getElementById('season-info');
  const matchesListEl = () => document.getElementById('matches-list');
  const standingsEl = () => document.getElementById('standings');
  const modal = () => document.getElementById('match-modal');
  const playerModal = () => document.getElementById('player-modal');

  let editingMatchId = null;
  let editingPlayerId = null;

  const init = async () => {
    if (!window.firebase || !window.db) {
      console.error('firebase or db not found. Stelle sicher, dass Firebase vor ui.js geladen ist.');
      return;
    }

    firebase.auth().onAuthStateChanged(async u => {
      currentUser = u;
      await checkAdmin();
      await loadCurrentSeason();
      await loadPlayers();
      renderPlayerManagement();
      subscribeMatches();
    });

    document.getElementById('btn-refresh').addEventListener('click', async () => {
      await loadPlayers(); await loadCurrentSeason();
    });

    document.getElementById('btn-signout').addEventListener('click', () => firebase.auth().signOut());

    // player modal controls
    document.getElementById('player-modal-close').addEventListener('click', closePlayerModal);
    document.getElementById('player-modal-cancel').addEventListener('click', closePlayerModal);
    document.getElementById('btn-add-player').addEventListener('click', () => openPlayerModal());
    document.getElementById('player-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      await submitPlayerForm();
    });

    // match modal controls
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('result-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      await submitResult();
    });
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
    const btn = document.getElementById('btn-add-player');
    if (btn) btn.style.display = isAdmin ? 'inline-block' : 'none';
  }

  // ---------- Players ----------
  async function loadPlayers() {
    const el = playersEl();
    if (el) el.innerHTML = '<div class="muted">Lade Spieler…</div>';
    try {
      const snap = await db.collection('users').orderBy('displayName').get();
      usersCache.clear();
      if (el) el.innerHTML = '';
      const docs = snap.docs;
      docs.forEach(doc => {
        const u = doc.data();
        usersCache.set(doc.id, u);
        if (el) {
          const item = document.createElement('label');
          item.className = 'player-item';
          item.innerHTML = `
            <input type="checkbox" data-uid="${doc.id}">
            <div class="player-name">${escapeHtml(u.displayName || u.email || doc.id)}</div>
            <div class="muted" style="margin-left:auto">${u.isAdmin ? 'Admin' : ''}</div>
          `;
          el.appendChild(item);
        }
      });
      if (el && docs.length === 0) el.innerHTML = '<div class="muted">Keine Spieler gefunden.</div>';
    } catch (err) {
      console.error('loadPlayers error', err);
      if (el) el.innerHTML = '<div class="muted">Fehler beim Laden der Spieler.</div>';
    }
  }

  function renderPlayerManagement() {
    const el = manageEl();
    if (!el) return;
    el.innerHTML = '<div class="muted">Lade Spielerverwaltung…</div>';
    if (!usersCache.size) {
      el.innerHTML = '<div class="muted">Keine Spieler vorhanden.</div>';
      return;
    }
    el.innerHTML = '';
    for (const [id, u] of usersCache) {
      const row = document.createElement('div');
      row.className = 'player-row';
      const avatarUrl = u.avatarUrl || '';
      row.innerHTML = `
        <img src="${avatarUrl ? escapeHtml(avatarUrl) : ''}" alt="" class="player-avatar" onerror="this.style.display='none'">
        <div class="player-meta">
          <div style="font-weight:600">${escapeHtml(u.displayName || u.email || id)}</div>
          <div class="muted" style="font-size:0.9rem">${escapeHtml(u.email || '')} ${u.isAdmin ? ' · Admin' : ''}</div>
        </div>
        <div class="player-actions">
          <button class="btn" data-action="edit" data-id="${id}">Bearbeiten</button>
          ${isAdmin ? `<button class="btn btn-ghost" data-action="delete" data-id="${id}">Löschen</button>` : ''}
        </div>
      `;
      row.querySelectorAll('button').forEach(b => {
        b.addEventListener('click', ev => {
          const id = ev.currentTarget.dataset.id;
          const action = ev.currentTarget.dataset.action;
          if (action === 'edit') openPlayerModal(id);
          else if (action === 'delete') deletePlayer(id);
        });
      });
      el.appendChild(row);
    }
  }

  function openPlayerModal(playerId = null) {
    editingPlayerId = playerId;
    const title = document.getElementById('player-modal-title');
    const preview = document.getElementById('avatar-preview');
    (document.getElementById('player-form')).reset();
    preview.innerHTML = '';
    if (!playerId) {
      title.textContent = 'Spieler erstellen';
      document.getElementById('player-displayName').value = '';
      document.getElementById('player-email').value = '';
      document.getElementById('player-isAdmin').checked = false;
    } else {
      title.textContent = 'Spieler bearbeiten';
      const data = usersCache.get(playerId) || {};
      document.getElementById('player-displayName').value = data.displayName || '';
      document.getElementById('player-email').value = data.email || '';
      document.getElementById('player-isAdmin').checked = !!data.isAdmin;
      if (data.avatarUrl) {
        preview.innerHTML = `<img src="${escapeHtml(data.avatarUrl)}" class="avatar-small" onerror="this.style.display='none'">`;
      }
    }
    const md = playerModal();
    md.setAttribute('aria-hidden','false');
    md.style.display = 'flex';
  }

  function closePlayerModal() {
    editingPlayerId = null;
    const md = playerModal();
    md.setAttribute('aria-hidden','true');
    md.style.display = 'none';
  }

  async function submitPlayerForm() {
    if (!isAdmin) { alert('Nur Admins dürfen Spieler anlegen/bearbeiten.'); return; }
    const displayName = document.getElementById('player-displayName').value.trim();
    const email = document.getElementById('player-email').value.trim() || null;
    const isAdminFlag = document.getElementById('player-isAdmin').checked;
    const avatarInput = document.getElementById('player-avatar');
    const file = avatarInput && avatarInput.files && avatarInput.files[0];

    if (!displayName) { alert('Gib einen Anzeigenamen ein.'); return; }

    try {
      let docRef;
      if (editingPlayerId) {
        docRef = db.collection('users').doc(editingPlayerId);
        await docRef.update({
          displayName, email, isAdmin: isAdminFlag
        });
      } else {
        docRef = db.collection('users').doc();
        await docRef.set({
          displayName, email, isAdmin: isAdminFlag, createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }

      if (file) {
        const storageRef = firebase.storage().ref();
        const avatarRef = storageRef.child(`avatars/${docRef.id}_${Date.now()}`);
        await avatarRef.put(file);
        const url = await avatarRef.getDownloadURL();
        await docRef.update({ avatarUrl: url, avatarPath: avatarRef.fullPath });
      }

      await loadPlayers();
      renderPlayerManagement();
      closePlayerModal();
    } catch (err) {
      console.error('submitPlayerForm error', err);
      alert('Fehler beim Speichern: ' + (err.message || err));
    }
  }

  async function deletePlayer(playerId) {
    if (!isAdmin) { alert('Nur Admins dürfen Spieler löschen.'); return; }
    if (!confirm('Spieler wirklich löschen? Dies entfernt nur das Profil-Dokument, nicht das Auth-Konto.')) return;
    try {
      const doc = await db.collection('users').doc(playerId).get();
      if (doc.exists) {
        const data = doc.data();
        if (data && data.avatarPath) {
          try {
            await firebase.storage().ref(data.avatarPath).delete();
          } catch (e) {
            console.warn('avatar deletion failed', e);
          }
        }
      }
      await db.collection('users').doc(playerId).delete();
      usersCache.delete(playerId);
      renderPlayerManagement();
      await loadPlayers();
    } catch (err) {
      console.error('deletePlayer error', err);
      alert('Fehler beim Löschen: ' + (err.message || err));
    }
  }

  // ---------- Matches ----------
  function subscribeMatches() {
    if (matchesUnsub) matchesUnsub();
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
    const doc = await db.collection('matches').doc(matchId).get();
    if (!doc.exists) { alert('Match nicht gefunden'); return; }
    const m = doc.data();
    alert(`Match: R${m.roundNumber}\n${usersCache.get(m.homeUserId)?.displayName || m.homeUserId} vs ${usersCache.get(m.awayUserId)?.displayName || m.awayUserId}\nDatum: ${m.scheduledDate && m.scheduledDate.toDate ? m.scheduledDate.toDate().toLocaleString() : ''}`);
  }

  async function openResultModal(matchId) {
    editingMatchId = matchId;
    const doc = await db.collection('matches').doc(matchId).get();
    if (!doc.exists) { alert('Match nicht gefunden'); return; }
    const m = doc.data();
    document.getElementById('modal-match-info').textContent = `R${m.roundNumber} — ${usersCache.get(m.homeUserId)?.displayName || m.homeUserId} vs ${usersCache.get(m.awayUserId)?.displayName || m.awayUserId}`;
    document.getElementById('home-score').value = m.homeScore != null ? m.homeScore : '';
    document.getElementById('away-score').value = m.awayScore != null ? m.awayScore : '';
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

  // ---------- Season ----------
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

  // util
  function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

  document.addEventListener('DOMContentLoaded', init);
})();
