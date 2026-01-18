// ui.js — UI + Resultat‑Modal
// Vollständige UI-Logik inkl. Modal zum Erfassen von Ergebnissen.
// Hinweise:
// - Diese Datei voraussetzt app.js (firebase init + window.CLS helpers) geladen vorher.
// - Platzhalter / Selektoren wie #matches-list, .decks-grid, #player-management etc. sind wie im Dashboard-HTML vorhanden.

(function(){
  'use strict';

  // Referenzen (erwartet von app.js)
  var db = window.db;
  var auth = window.auth;
  var CLS = window.CLS || {};

  if (!db || !auth) {
    console.error('ui.js: db oder auth nicht verfügbar. Stelle sicher, dass app.js geladen wurde.');
    return;
  }

  // Short helpers
  function $qs(s){ return document.querySelector(s); }
  function $create(tag, attrs, text){
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function(k){
      if (k === 'class') el.className = attrs[k];
      else if (k === 'html') el.innerHTML = attrs[k];
      else el.setAttribute(k, attrs[k]);
    });
    if (text) el.textContent = text;
    return el;
  }

  // App state
  var state = {
    currentUser: null,
    isAdmin: false,
    players: [],
    decks: [],
    seasons: [],
    activeSeason: null,
    matches: []
  };

  // Containers (wie im Dashboard HTML)
  var containers = {
    players: $qs('#player-management'),
    decks: $qs('#decks-grid'),
    matches: $qs('#matches-list'),
    seasonInfo: $qs('#season-info'),
    standings: $qs('#standings'),
    organizer: $qs('#organizer')
  };

  // ---------------- AUTH UI ----------------
  function initAuthUI(){
    var emailEl = $qs('.user-pill .email') || $qs('#logged-as');
    var logoutBtn = $qs('.btn-logout') || $qs('#btn-signout');
    if (logoutBtn) logoutBtn.style.display = 'none';

    auth.onAuthStateChanged(async function(user){
      state.currentUser = user;
      if (user) {
        try { state.isAdmin = await CLS.isUserAdmin(user); } catch(e){ state.isAdmin = false; }
        if (emailEl) emailEl.textContent = user.email || user.displayName || 'User';
        if (logoutBtn) logoutBtn.style.display = '';
      } else {
        state.isAdmin = false;
        if (emailEl) emailEl.textContent = 'nicht eingeloggt';
        if (logoutBtn) logoutBtn.style.display = 'none';
      }
      renderAll();
    });

    if (logoutBtn) {
      logoutBtn.addEventListener('click', function(e){
        e.preventDefault();
        auth.signOut().catch(function(err){ console.error('SignOut error', err); alert('Logout fehlgeschlagen'); });
      });
    }
  }

  // ---------------- LISTENERS (Realtime) ----------------
  var unsubPlayers=null, unsubDecks=null, unsubSeasons=null, unsubMatches=null;

  function startListeners(){
    // players
    if (unsubPlayers) unsubPlayers();
    unsubPlayers = db.collection('players').orderBy('displayName','asc').onSnapshot(function(snap){
      state.players = snap.docs.map(d => ({ id: d.id, data: d.data() }));
      renderPlayers();
      // Also update matches UI because names may change
      renderMatches();
    }, e => console.error('players snapshot', e));

    // decks
    if (unsubDecks) unsubDecks();
    unsubDecks = db.collection('decks').orderBy('createdAt','asc').onSnapshot(function(snap){
      state.decks = snap.docs.map(d => ({ id: d.id, data: d.data() }));
      renderDecks();
    }, e => console.error('decks snapshot', e));

    // seasons
    if (unsubSeasons) unsubSeasons();
    unsubSeasons = db.collection('seasons').orderBy('createdAt','desc').onSnapshot(function(snap){
      state.seasons = snap.docs.map(d => ({ id: d.id, data: d.data() }));
      state.activeSeason = state.seasons.find(s => s.data && s.data.active) || null;
      renderSeason();
    }, e => console.error('seasons snapshot', e));

    // matches
    if (unsubMatches) unsubMatches();
    unsubMatches = db.collection('matches').orderBy('round','asc').onSnapshot(function(snap){
      state.matches = snap.docs.map(d => ({ id: d.id, data: d.data() }));
      renderMatches();
      renderStandings();
    }, e => console.error('matches snapshot', e));
  }

  // ---------------- RENDER: Players/Decks/Season ----------------
  function renderPlayers(){
    var c = containers.players; if (!c) return;
    c.innerHTML = '';
    var title = $create('div',{class:'section-title'}, 'Spieler');
    c.appendChild(title);
    if (state.isAdmin) {
      var addBtn = $create('button',{class:'btn btn-primary'}, 'Spieler hinzufügen');
      addBtn.addEventListener('click', addPlayer);
      c.appendChild(addBtn);
    }
    state.players.forEach(function(p){
      var row = $create('div',{class:'entry'});
      var left = $create('div'); left.style.flex = '1';
      left.appendChild($create('div', null, p.data.displayName || '—'));
      left.appendChild($create('div',{class:'muted'}, p.data.email || ''));
      row.appendChild(left);
      var actions = $create('div');
      if (state.isAdmin){
        var edit = $create('button',{class:'btn btn-ghost'}, 'Bearbeiten'); edit.addEventListener('click', ()=>editPlayer(p.id, p.data));
        var del = $create('button',{class:'btn btn-danger'}, 'Löschen'); del.addEventListener('click', ()=>deletePlayer(p.id));
        actions.appendChild(edit); actions.appendChild(del);
      }
      row.appendChild(actions);
      c.appendChild(row);
    });
  }

  function renderDecks(){
    var c = containers.decks; if (!c) return;
    c.innerHTML = '';
    if (state.currentUser){
      var add = $create('button',{class:'btn btn-ghost'}, 'Deck hinzufügen'); add.addEventListener('click', addDeck);
      c.appendChild(add);
    }
    var grid = $create('div',{class:'decks-grid'});
    state.decks.forEach(function(d){
      var card = $create('div',{class:'deck-card'});
      var meta = $create('div',{class:'deck-meta'});
      var nameInput = $create('input',{class:'pill-input', value: d.data.name || ''});
      nameInput.addEventListener('change', function(){ db.collection('decks').doc(d.id).update({ name: nameInput.value }); });
      meta.appendChild(nameInput);
      meta.appendChild($create('div',{class:'small-muted'}, 'Commander (Scryfall) – Vorschläge beim Tippen'));
      var cmdInput = $create('input',{class:'pill-input', value: d.data.commander || ''});
      cmdInput.addEventListener('change', function(){ db.collection('decks').doc(d.id).update({ commander: cmdInput.value }); });
      meta.appendChild(cmdInput);
      var actions = $create('div',{class:'actions'});
      var linkBtn = $create('button',{class:'btn btn-ghost'}, 'Link speichern'); linkBtn.addEventListener('click', function(){ var url = prompt('Decklist URL', d.data.archidektUrl||''); if (url!==null) db.collection('decks').doc(d.id).update({ archidektUrl: url }); });
      var rem = $create('button',{class:'btn btn-danger'}, 'Deck entfernen'); rem.addEventListener('click', function(){ if(confirm('Deck entfernen?')) db.collection('decks').doc(d.id).delete(); });
      actions.appendChild(linkBtn); actions.appendChild(rem);
      meta.appendChild(actions);
      card.appendChild(meta);
      var img = $create('img',{class:'card-art', src: d.data.cardArtUrl || 'https://via.placeholder.com/96x132.png?text=Card'});
      card.appendChild(img);
      grid.appendChild(card);
    });
    c.appendChild(grid);
  }

  function renderSeason(){
    var el = containers.seasonInfo; if (!el) return;
    el.innerHTML = '';
    if (!state.activeSeason) { el.textContent = 'Keine aktive Season'; return; }
    var s = state.activeSeason;
    el.appendChild($create('div',{style:'font-weight:700'}, s.data.title || 'Season'));
    el.appendChild($create('div',{class:'muted'}, 'Runden: ' + (s.data.rounds||'?') + ' · Dauer (Tage): ' + (s.data.roundDurationDays||'?')));
    if (state.isAdmin){
      var org = containers.organizer || $qs('#organizer') || el;
      if (org){
        org.innerHTML = '';
        var openBtn = $create('button',{class:'btn btn-primary'}, 'Season eröffnen'); openBtn.addEventListener('click', createSeason);
        var closeBtn = $create('button',{class:'btn btn-ghost'}, 'Season beenden'); closeBtn.addEventListener('click', endSeason);
        org.appendChild(openBtn); org.appendChild(closeBtn);
      }
    }
  }

  // ---------------- MATCHES + RESULT BUTTONS + MODAL ----------------

  function renderMatches(){
    var c = containers.matches; if (!c) return;
    c.innerHTML = '';
    var title = $create('div',{class:'section-title'}, 'Spielplan');
    c.appendChild(title);

    // Partition matches by round (optional)
    var grouped = {};
    state.matches.forEach(function(m){
      var r = m.data.round || 1;
      grouped[r] = grouped[r] || []; grouped[r].push(m);
    });

    Object.keys(grouped).sort((a,b)=>a-b).forEach(function(round){
      var roundHeader = $create('div',{class:'muted'}, 'Runde ' + round);
      c.appendChild(roundHeader);
      grouped[round].forEach(function(m){
        c.appendChild(createMatchRow(m));
      });
    });
  }

  function createMatchRow(m){
    var row = $create('div',{class:'entry'});
    var left = $create('div'); left.style.flex = '1';
    left.appendChild($create('div', null, getPlayerName(m.data.playerAId) + ' vs ' + getPlayerName(m.data.playerBId)));
    left.appendChild($create('div',{class:'muted'}, 'Runde ' + (m.data.round || '?')));
    row.appendChild(left);

    // score display
    var scoreText = (typeof m.data.scoreA === 'number' || typeof m.data.scoreB === 'number') ? ((m.data.scoreA===null?'-':m.data.scoreA) + ' : ' + (m.data.scoreB===null?'-':m.data.scoreB)) : '- : -';
    var scoreEl = $create('div',{class:'muted'}, scoreText);

    // Ergebnis Button: enabled if admin or one of players
    var btn = $create('button',{class:'btn btn-primary'}, 'Ergebnis');
    var allowed = canReportResult(m);
    if (!allowed) {
      btn.disabled = true;
      btn.classList.add('btn-ghost'); // looks disabled
    } else {
      btn.addEventListener('click', function(){ openResultModal(m.id, m.data); });
    }

    var rightWrap = $create('div'); rightWrap.style.display = 'flex'; rightWrap.style.gap = '8px'; rightWrap.style.alignItems = 'center';
    rightWrap.appendChild(scoreEl); rightWrap.appendChild(btn);
    row.appendChild(rightWrap);

    return row;
  }

  // Who may report a result? Admin OR participant whose player doc uid matches currentUser.uid
  function canReportResult(m){
    if (state.isAdmin) return true;
    if (!state.currentUser) return false;
    // find player's doc ids that belong to currentUser
    var myPlayerIds = state.players.filter(function(p){ return p.data.uid && p.data.uid === state.currentUser.uid; }).map(p=>p.id);
    if (myPlayerIds.length === 0) return false;
    return myPlayerIds.includes(m.data.playerAId) || myPlayerIds.includes(m.data.playerBId);
  }

  // Modal creation / open
  var modalEl = null;
  function createModal(){
    if (modalEl) return modalEl;
    // overlay
    var overlay = $create('div',{class:'cls-modal-overlay', style:'position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:999999;padding:20px;background:rgba(0,0,0,0.45)'});
    var dialog = $create('div',{class:'cls-modal', style:'width:min(520px,100%);border-radius:12px;padding:16px;background:linear-gradient(180deg,#071018,#071018);color:var(--text);border:1px solid rgba(255,255,255,0.04)'});
    // header
    var h = $create('div',{style:'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px'});
    h.appendChild($create('div',{style:'font-weight:700'}, 'Ergebnis melden'));
    var closeBtn = $create('button',{class:'btn btn-ghost'}, 'Abbrechen');
    closeBtn.addEventListener('click', closeModal);
    h.appendChild(closeBtn);
    dialog.appendChild(h);

    // body: players & score inputs
    var body = $create('div',{style:'display:flex;flex-direction:column;gap:8px'});
    var playersRow = $create('div',{style:'display:flex;gap:8px;align-items:center'});
    var pAname = $create('div',{style:'flex:1;font-weight:700'}, 'Player A');
    var scoreA = $create('input',{type:'number', class:'pill-input', style:'width:84px;text-align:center'}, '0');
    playersRow.appendChild(pAname); playersRow.appendChild(scoreA);
    body.appendChild(playersRow);

    var vsRow = $create('div',{class:'muted', style:'text-align:center;margin:4px 0'}, 'vs');
    body.appendChild(vsRow);

    var playersRowB = $create('div',{style:'display:flex;gap:8px;align-items:center'});
    var pBname = $create('div',{style:'flex:1;font-weight:700'}, 'Player B');
    var scoreB = $create('input',{type:'number', class:'pill-input', style:'width:84px;text-align:center'}, '0');
    playersRowB.appendChild(pBname); playersRowB.appendChild(scoreB);
    body.appendChild(playersRowB);

    // optional note
    var note = $create('div',{class:'muted', style:'font-size:0.9rem;margin-top:6px'}, 'Optional: füge hier ein Kommentar hinzu (z. B. Ergebnisquelle)');
    var noteInput = $create('input',{type:'text', class:'pill-input', placeholder:'Kommentar (optional)'});
    body.appendChild(noteInput);

    dialog.appendChild(body);

    // footer actions
    var footer = $create('div',{style:'display:flex;justify-content:flex-end;gap:8px;margin-top:12px'});
    var saveBtn = $create('button',{class:'btn btn-primary'}, 'Speichern');
    var cancelBtn = $create('button',{class:'btn btn-ghost'}, 'Abbrechen');
    cancelBtn.addEventListener('click', closeModal);
    footer.appendChild(cancelBtn); footer.appendChild(saveBtn);
    dialog.appendChild(footer);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // expose refs
    modalEl = {
      overlay: overlay,
      dialog: dialog,
      pAname: pAname,
      pBname: pBname,
      scoreA: scoreA,
      scoreB: scoreB,
      noteInput: noteInput,
      saveBtn: saveBtn,
      close: closeModal
    };

    // accessibility: ESC to close
    overlay.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeModal(); });

    return modalEl;
  }

  var currentModalMatchId = null;

  function openResultModal(matchId, matchData){
    var m = matchData;
    if (!m) {
      db.collection('matches').doc(matchId).get().then(function(doc){ if(doc.exists) openResultModal(matchId, doc.data()); else alert('Match nicht gefunden'); });
      return;
    }
    var modal = createModal();
    // fill names
    modal.pAname.textContent = getPlayerName(m.playerAId) || 'A';
    modal.pBname.textContent = getPlayerName(m.playerBId) || 'B';
    modal.scoreA.value = (typeof m.scoreA === 'number' ? m.scoreA : '');
    modal.scoreB.value = (typeof m.scoreB === 'number' ? m.scoreB : '');
    modal.noteInput.value = m.resultNote || '';

    // save handler
    modal.saveBtn.onclick = async function(){
      var a = parseInt(modal.scoreA.value, 10);
      var b = parseInt(modal.scoreB.value, 10);
      if (isNaN(a) || isNaN(b)) { alert('Bitte gültige Zahlen eingeben'); return; }
      // permission check
      if (!canReportResult({ data: m })) { alert('Keine Berechtigung, Ergebnis zu melden'); closeModal(); return; }
      try {
        await db.collection('matches').doc(matchId).update({
          scoreA: a,
          scoreB: b,
          resultNote: modal.noteInput.value || '',
          resultRecordedAt: CLS.serverTimestamp(),
          resultRecordedBy: state.currentUser ? state.currentUser.uid : null
        });
        closeModal();
        // Optional: feedback
        alert('Ergebnis gespeichert');
      } catch (e) {
        console.error('Fehler beim Speichern des Ergebnisses', e);
        alert('Fehler beim Speichern');
      }
    };

    // show overlay
    modal.overlay.style.display = 'flex';
    // focus on first input
    setTimeout(function(){ modal.scoreA.focus(); }, 50);
    currentModalMatchId = matchId;
  }

  function closeModal(){
    if (!modalEl) return;
    modalEl.overlay.style.display = 'none';
    modalEl.saveBtn.onclick = null;
    currentModalMatchId = null;
  }

  // ----------------- CRUD ACTIONS (Players / Decks / Seasons / Schedule) ----------------

  async function addPlayer(){
    if (!state.isAdmin) return alert('Nur Admins können Spieler anlegen.');
    var name = prompt('Neuer Spieler — Name'); if (!name) return;
    var email = prompt('E-Mail (optional)');
    var isAdmin = confirm('Admin-Rechte vergeben? OK = Ja');
    try { await db.collection('players').add({ displayName: name, email: email||'', isAdmin: !!isAdmin, createdAt: CLS.serverTimestamp() }); alert('Spieler angelegt'); }
    catch(e){ console.error(e); alert('Fehler beim Anlegen'); }
  }

  async function editPlayer(id, data){
    if (!state.isAdmin) return alert('Keine Rechte');
    var name = prompt('Spieler Name', data.displayName || ''); if(!name) return;
    var email = prompt('E-Mail', data.email || '');
    var isAdmin = confirm('Admin-Rechte setzen? OK = Ja');
    try { await db.collection('players').doc(id).update({ displayName: name, email: email||'', isAdmin: !!isAdmin }); alert('Aktualisiert'); }
    catch(e){ console.error(e); alert('Fehler beim Aktualisieren'); }
  }

  async function deletePlayer(id){
    if (!state.isAdmin) return alert('Keine Rechte');
    if (!confirm('Spieler löschen?')) return;
    try { await db.collection('players').doc(id).delete(); alert('Gelöscht'); } catch(e){ console.error(e); alert('Fehler beim Löschen'); }
  }

  async function addDeck(){
    if (!state.currentUser) return alert('Bitte einloggen.');
    var ownerId = null;
    if (state.isAdmin){
      var list = state.players.map(function(p,i){ return (i+1)+') '+p.data.displayName; }).join('\n');
      var chosen = prompt('Für welchen Spieler? Nummer wählen:\n'+list);
      var idx = parseInt(chosen,10)-1;
      if (isNaN(idx) || !state.players[idx]) return alert('Ungültig');
      ownerId = state.players[idx].id;
    } else {
      var q = await db.collection('players').where('uid','==', state.currentUser.uid).limit(1).get();
      if (q.empty) return alert('Kein Spielerprofil gefunden');
      ownerId = q.docs[0].id;
    }
    var name = prompt('Deck Name'); if (!name) return;
    var cmd = prompt('Commander (optional)');
    var arch = prompt('Decklist URL (optional)');
    try { await db.collection('decks').add({ playerId: ownerId, name: name, commander: cmd||'', archidektUrl: arch||'', createdAt: CLS.serverTimestamp() }); alert('Deck angelegt'); }
    catch(e){ console.error(e); alert('Fehler beim Speichern'); }
  }

  async function createSeason(){
    if (!state.isAdmin) return alert('Nur Admins');
    var title = prompt('Season Titel'); if (!title) return;
    var rounds = parseInt(prompt('Anzahl Runden','2'),10) || 2;
    var roundDays = parseInt(prompt('Rundendauer in Tagen','14'),10) || 14;
    try {
      var prev = await db.collection('seasons').where('active','==', true).get();
      var batch = db.batch();
      prev.forEach(function(d){ batch.update(d.ref, { active: false }); });
      var newRef = db.collection('seasons').doc();
      batch.set(newRef, { title: title, rounds: rounds, roundDurationDays: roundDays, active: true, createdAt: CLS.serverTimestamp() });
      await batch.commit();
      alert('Season erstellt');
    } catch(e){ console.error(e); alert('Fehler beim Erstellen'); }
  }

  async function endSeason(){
    if (!state.isAdmin) return alert('Nur Admins');
    if (!state.activeSeason) return alert('Keine aktive Season');
    if (!confirm('Season beenden?')) return;
    try { await db.collection('seasons').doc(state.activeSeason.id).update({ active: false, endedAt: CLS.serverTimestamp() }); alert('Season beendet'); }
    catch(e){ console.error(e); alert('Fehler beim Beenden'); }
  }

  async function generateSchedule(){
    if (!state.isAdmin) return alert('Nur Admins');
    if (!state.activeSeason) return alert('Keine aktive Season');
    var plIds = state.players.map(function(p){ return p.id; });
    if (plIds.length < 2) return alert('Nicht genügend Spieler');
    var rounds = CLS.generateRoundRobin(plIds);
    try {
      var seasonId = state.activeSeason.id;
      var exist = await db.collection('matches').where('seasonId','==', seasonId).get();
      var batch = db.batch();
      exist.forEach(function(d){ batch.delete(d.ref); });
      rounds.forEach(function(pairs, roundIndex){
        pairs.forEach(function(pair){
          var a = pair[0], b = pair[1];
          var ref = db.collection('matches').doc();
          batch.set(ref, { seasonId: seasonId, round: roundIndex+1, playerAId: a, playerBId: b, scoreA: null, scoreB: null, createdAt: CLS.serverTimestamp() });
        });
      });
      await batch.commit();
      alert('Spielplan generiert');
    } catch(e){ console.error(e); alert('Fehler beim Generieren'); }
  }

  // ----------------- Standings rendering -----------------
  async function renderStandings(){
    var el = containers.standings; if (!el) return;
    el.innerHTML = '';
    if (!state.activeSeason) { el.textContent = 'Noch keine Resultate.'; return; }
    var standings = await CLS.computeStandings(state.activeSeason.id);
    var arr = Object.keys(standings).map(function(pid){ return { pid: pid, s: standings[pid] }; });
    arr.sort(function(a,b){ return b.s.points - a.s.points || (b.s.gf - b.s.ga) - (a.s.gf - a.s.ga); });
    var ol = document.createElement('ol');
    arr.forEach(function(item){ ol.appendChild($create('li', null, (getPlayerName(item.pid) || item.pid) + ' — ' + item.s.points + ' P, ' + item.s.played + ' Spiele')); });
    el.appendChild(ol);
  }

  // ----------------- Utility -----------------
  function getPlayerName(playerId){
    var p = state.players.find(function(x){ return x.id === playerId; });
    return p ? (p.data.displayName || p.data.email || p.id) : (playerId || '');
  }

  function renderAll(){
    renderPlayers(); renderDecks(); renderMatches(); renderSeason(); renderStandings();
  }

  // ----------------- Init -----------------
  function init(){
    initAuthUI();
    startListeners();

    // bind optional page buttons (if present)
    var genBtn = $qs('#generate-schedule'); if (genBtn) genBtn.addEventListener('click', generateSchedule);
    var addPBtn = $qs('#btn-add-player'); if (addPBtn) addPBtn.addEventListener('click', addPlayer);
    var createSBtn = $qs('#btn-create-season'); if (createSBtn) createSBtn.addEventListener('click', createSeason);

    console.log('ui.js (results-enabled) initialisiert');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();

  // Expose for debugging
  window.CLS_UI = {
    openResultModal: openResultModal,
    addPlayer: addPlayer,
    addDeck: addDeck,
    generateSchedule: generateSchedule,
    createSeason: createSeason,
    endSeason: endSeason,
    renderStandings: renderStandings
  };

})(); // end ui.js
