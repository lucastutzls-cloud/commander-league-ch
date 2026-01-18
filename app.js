/* app.js - compat-Version
   WICHTIG: Ersetze das firebaseConfig-Objekt unten mit deiner Firebase-Konfiguration (aus Project settings -> Your apps -> Firebase SDK snippet -> Config).
*/

/* ---------------------------
   Firebase Config (ERSETZEN)
   --------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyCOyHrZXJkJtS2UzddH0sCN_NzRiILIheI",
  authDomain: "commanderleague-ch.firebaseapp.com",
  projectId: "commanderleague-ch",
  storageBucket: "commanderleague-ch.firebasestorage.app",
  messagingSenderId: "343380146333",
  appId: "1:343380146333:web:b1553bdc651482c062bc74",
  measurementId: "G-TJP8BYHC0F"
};

/* Initialisierung (compat) */
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

/* ---------------------------
   Restliche App-Logik (vereinfachte Demo-Version)
   — (dieser Code ist funktionsfähig und nutzt die compat-API)
*/

/* UI Helpers */
const el = id => document.getElementById(id);
const show = id => { const e = el(id); if(e) e.classList.remove('hidden'); }
const hide = id => { const e = el(id); if(e) e.classList.add('hidden'); }

/* Tabs */
document.addEventListener('click', (ev) => {
  if (ev.target.matches('.tab-btn')) {
    document.querySelectorAll('.tab-pane').forEach(n=>n.classList.add('hidden'));
    const tab = ev.target.dataset.tab;
    show(tab);
  }
});

/* Auth */
el('btn-login').addEventListener('click', async () => {
  const email = el('email').value.trim();
  const pw = el('password').value;
  if (!email || !pw) { alert('E‑Mail und Passwort erforderlich'); return; }
  try { await auth.signInWithEmailAndPassword(email,pw); }
  catch(e){ alert('Login Fehler: '+e.message) }
});
el('btn-register').addEventListener('click', async () => {
  const email = el('email').value.trim();
  const pw = el('password').value;
  if (!email || !pw) { alert('E‑Mail und Passwort erforderlich'); return; }
  try {
    const cred = await auth.createUserWithEmailAndPassword(email,pw);
    await db.collection('users').doc(cred.user.uid).set({
      email,
      displayName: email.split('@')[0],
      isAdmin: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert('Registrierung erfolgreich.');
  } catch(e){ alert('Registrieren Fehler: '+e.message) }
});
el('logout-btn').addEventListener('click', ()=>auth.signOut());

/* Auth state */
let currentUserDoc = null;
auth.onAuthStateChanged(async user => {
  if (user) {
    el('user-email').textContent = user.email;
    el('logout-btn').classList.remove('hidden');
    hide('auth-section'); show('tabs'); show('season');
    await loadCurrentUser(); await loadSeasonsAndData();
  } else {
    el('user-email').textContent = '';
    el('logout-btn').classList.add('hidden');
    show('auth-section'); hide('tabs');
    document.querySelectorAll('.tab-pane').forEach(n=>n.classList.add('hidden'));
  }
});

/* Load current user doc */
async function loadCurrentUser(){
  const uid = auth.currentUser.uid;
  const snap = await db.collection('users').doc(uid).get();
  currentUserDoc = snap.exists ? snap.data() : null;
  el('displayName').value = currentUserDoc?.displayName || '';
  renderDeckForms();
}

/* Deck forms */
async function renderDeckForms(){
  const uid = auth.currentUser.uid;
  const decksSnap = await db.collection('decks').where('userId','==',uid).get();
  const container = el('deck-forms'); container.innerHTML = '';
  decksSnap.forEach(doc => {
    const d = doc.data();
    const card = document.createElement('div'); card.className='card';
    card.innerHTML = `
      <input class="deckname" data-id="${doc.id}" value="${escapeHtml(d.deckName||'')}" placeholder="Deck Name" />
      <input class="commander" data-id="${doc.id}" value="${escapeHtml(d.commanderName||'')}" placeholder="Commander (Scryfall Name)" />
      <input class="archidekt" data-id="${doc.id}" value="${escapeHtml(d.archidektUrl||'')}" placeholder="Archidekt Link" />
      <div style="margin-top:8px">
        <button class="save-deck btn" data-id="${doc.id}">Speichern</button>
        <button class="remove-deck btn danger" data-id="${doc.id}">Deck entfernen</button>
      </div>
    `;
    container.appendChild(card);
  });
}

/* Add deck */
el('add-deck').addEventListener('click', async () => {
  const uid = auth.currentUser.uid;
  const decksSnap = await db.collection('decks').where('userId','==',uid).get();
  if (decksSnap.size >= 3) { alert('Max. 3 Decks erlaubt.'); return; }
  await db.collection('decks').add({ userId: uid, deckName:'', archidektUrl:'', commanderName:'', commanderScryfallId:'', commanderImageUrl:'', lockedSeasonId:null });
  renderDeckForms();
});

/* Save / remove deck (delegated) */
document.addEventListener('click', async (ev) => {
  if (ev.target.matches('.save-deck')) {
    const id = ev.target.dataset.id;
    const card = ev.target.closest('.card');
    const deckName = card.querySelector('.deckname').value;
    const commander = card.querySelector('.commander').value;
    const archidekt = card.querySelector('.archidekt').value;
    await db.collection('decks').doc(id).update({ deckName, commanderName: commander, archidektUrl: archidekt });
    alert('Deck gespeichert.');
  } else if (ev.target.matches('.remove-deck')) {
    const id = ev.target.dataset.id;
    if (!confirm('Deck entfernen?')) return;
    await db.collection('decks').doc(id).delete();
    renderDeckForms();
  } else if (ev.target.matches('.enter-result')) {
    // handled below
  }
});

/* Admin: create season */
el('create-season').addEventListener('click', async () => {
  const name = el('season-name').value || `Season ${new Date().toISOString().slice(0,10)}`;
  const startDate = el('season-start').value ? new Date(el('season-start').value) : new Date();
  const roundLen = parseInt(el('round-length').value || '14',10);
  const ref = await db.collection('seasons').add({ name, startDate: firebase.firestore.Timestamp.fromDate(startDate), roundLengthDays: roundLen, status: 'planned', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  alert('Season erstellt. Wähle nun Spieler und generiere Spielplan.');
  await loadPlayerSelect(ref.id);
});

async function loadPlayerSelect(seasonId){
  const usersSnap = await db.collection('users').get();
  const container = el('player-select'); container.innerHTML = `<h4>Spieler auswählen für Season</h4><div id="player-checks"></div>`;
  const checks = container.querySelector('#player-checks');
  usersSnap.forEach(u => {
    const d = u.data(); const id = u.id;
    const row = document.createElement('div'); row.innerHTML = `<label><input type="checkbox" data-uid="${id}" /> ${escapeHtml(d.displayName || d.email)}</label>`;
    checks.appendChild(row);
  });
}

/* Round robin generator */
function roundRobinPairs(players) {
  const list = players.slice();
  if (list.length % 2 === 1) list.push(null);
  const m = list.length;
  const rounds = [];
  for (let r=0;r<m-1;r++){
    const pairs = [];
    for (let i=0;i<m/2;i++){
      const a = list[i], b = list[m-1-i];
      if (a !== null && b !== null) pairs.push([a,b]);
    }
    rounds.push(pairs);
    list.splice(1,0,list.pop());
  }
  return rounds;
}

el('generate-schedule').addEventListener('click', async () => {
  const seasonsSnap = await db.collection('seasons').orderBy('createdAt','desc').limit(1).get();
  if (seasonsSnap.empty) { alert('Keine Season gefunden.'); return; }
  const seasonDoc = seasonsSnap.docs[0]; const season = {...seasonDoc.data(), id: seasonDoc.id};
  const checks = document.querySelectorAll('#player-select input[type=checkbox]');
  const selected = []; checks.forEach(ch => { if (ch.checked) selected.push(ch.dataset.uid); });
  if (selected.length < 2) { alert('Mind. 2 Spieler benötigt.'); return; }
  for (const uid of selected) await db.collection('seasonPlayers').add({ seasonId: season.id, userId: uid, active: true });
  const rounds = roundRobinPairs(selected);
  let roundNumber = 1;
  for (const r of rounds) {
    const startDate = new Date(season.startDate.toDate()); startDate.setDate(startDate.getDate() + (roundNumber-1) * season.roundLengthDays);
    for (const p of r) {
      await db.collection('matches').add({ seasonId: season.id, roundNumber, homeUserId: p[0], awayUserId: p[1], scheduledDate: firebase.firestore.Timestamp.fromDate(startDate), completed: false });
    }
    roundNumber++;
  }
  // Rückrunde
  const hinRoundsCount = rounds.length;
  for (let rIndex=0; rIndex<hinRoundsCount; rIndex++) {
    const r = rounds[rIndex];
    const startDate = new Date(season.startDate.toDate()); startDate.setDate(startDate.getDate() + (roundNumber-1) * season.roundLengthDays);
    for (const p of r) {
      await db.collection('matches').add({ seasonId: season.id, roundNumber, homeUserId: p[1], awayUserId: p[0], scheduledDate: firebase.firestore.Timestamp.fromDate(startDate), completed: false });
    }
    roundNumber++;
  }
  alert('Spielplan generiert (Hin + Rück).');
  await loadMatchesForSeason(season.id);
});

/* Matches listing & result input */
async function loadMatchesForSeason(seasonId) {
  const snap = await db.collection('matches').where('seasonId','==',seasonId).orderBy('roundNumber').get();
  const container = el('matches-list'); container.innerHTML = '';
  for (const doc of snap.docs) {
    const m = doc.data();
    const div = document.createElement('div'); div.className='card';
    div.innerHTML = `<strong>Runde ${m.roundNumber}</strong>
      <div>Heim: ${escapeHtml(m.homeUserId)} vs Gast: ${escapeHtml(m.awayUserId)}</div>
      <div>Datum: ${m.scheduledDate?.toDate?.().toLocaleDateString()}</div>
      <div><button class="enter-result btn" data-id="${doc.id}">Resultat erfassen</button></div>`;
    container.appendChild(div);
  }
}

/* Result entry (prompt demo) */
document.addEventListener('click', async (ev) => {
  if (ev.target.matches('.enter-result')) {
    const matchId = ev.target.dataset.id;
    const matchDoc = await db.collection('matches').doc(matchId).get();
    const match = matchDoc.data();
    const res = prompt('Gib Ergebnis ein (z.B. 2:0 oder 2:1)');
    if (!res) return;
    const parts = res.split(':').map(x=>parseInt(x,10));
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) { alert('Ungültiges Format.'); return; }
    const homeWins = parts[0], awayWins = parts[1];
    let homePts=0, awayPts=0;
    if (homeWins === 2 && awayWins === 0) { homePts=3; awayPts=0;}
    else if (homeWins === 2 && awayWins === 1) { homePts=2; awayPts=1;}
    else if (homeWins === 1 && awayWins === 2) { homePts=1; awayPts=2;}
    else if (homeWins === 0 && awayWins === 2) { homePts=0; awayPts=3;}
    else { alert('Ungültiges Ergebnis. Erlaubte Ergebnisse: 2:0, 2:1, 1:2, 0:2'); return; }
    await db.collection('matches').doc(matchId).update({ completed: true, result: `${homeWins}:${awayWins}`, homePoints: homePts, awayPoints: awayPts });
    alert('Resultat gespeichert.'); await loadSeasonsAndData();
  }
});

/* Standings compute */
async function computeStandings(seasonId){
  const matchesSnap = await db.collection('matches').where('seasonId','==',seasonId).get();
  const table = {};
  matchesSnap.forEach(mdoc => {
    const m = mdoc.data();
    if (!table[m.homeUserId]) table[m.homeUserId] = {points:0, gamesWon:0, gamesLost:0, matchWins:0, uid:m.homeUserId};
    if (!table[m.awayUserId]) table[m.awayUserId] = {points:0, gamesWon:0, gamesLost:0, matchWins:0, uid:m.awayUserId};
    if (m.homePoints !== undefined) {
      table[m.homeUserId].points += m.homePoints; table[m.awayUserId].points += m.awayPoints;
      if (m.result) {
        const [hw,aw] = m.result.split(':').map(x=>parseInt(x,10));
        table[m.homeUserId].gamesWon += hw; table[m.homeUserId].gamesLost += aw;
        table[m.awayUserId].gamesWon += aw; table[m.awayUserId].gamesLost += hw;
        if (hw > aw) table[m.homeUserId].matchWins += 1; else table[m.awayUserId].matchWins += 1;
      }
    }
  });
  const arr = Object.keys(table).map(uid => ({uid, ...table[uid]}));
  arr.sort((a,b)=> {
    if (b.points !== a.points) return b.points - a.points;
    const aDiff = a.gamesWon - a.gamesLost; const bDiff = b.gamesWon - b.gamesLost;
    if (bDiff !== aDiff) return bDiff - aDiff;
    return b.matchWins - a.matchWins;
  });
  return arr;
}

/* Load last season */
async function loadSeasonsAndData(){
  const seasonsSnap = await db.collection('seasons').orderBy('createdAt','desc').limit(1).get();
  if (seasonsSnap.empty) return;
  const seasonDoc = seasonsSnap.docs[0]; const season = {...seasonDoc.data(), id: seasonDoc.id};
  show('season');
  const standings = await computeStandings(season.id);
  const container = el('standings');
  container.innerHTML = '<ol>' + standings.map(s=>`<li>${escapeHtml(s.uid)}: ${s.points} pts (GDiff:${s.gamesWon - s.gamesLost})</li>`).join('') + '</ol>';
  await loadMatchesForSeason(season.id);
}

/* Utilities */
function escapeHtml(s){ if (!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
