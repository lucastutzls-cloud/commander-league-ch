/* app.js - Starter logic (Firebase + UI skeleton)
   IMPORTANT: Replace firebaseConfig with your project config below.
   This file contains core functions:
   - Auth (login/register/logout)
   - Basic Firestore read/write for users, decks, seasons, matches
   - Round Robin generator (Hin+Rück)
   - Client-side validation: deck used max once per match
*/

/* ---------------------------
   Firebase Config (REPLACE)
   --------------------------- */
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCOyHrZXJkJtS2UzddH0sCN_NzRiILIheI",
  authDomain: "commanderleague-ch.firebaseapp.com",
  projectId: "commanderleague-ch",
  storageBucket: "commanderleague-ch.firebasestorage.app",
  messagingSenderId: "343380146333",
  appId: "1:343380146333:web:b1553bdc651482c062bc74",
  measurementId: "G-TJP8BYHC0F"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

/* ---------------------------
   UI Helpers
   --------------------------- */
const el = id => document.getElementById(id);
const show = (id) => { el(id).classList.remove('hidden') }
const hide = (id) => { el(id).classList.add('hidden') }

/* Tabs */
document.addEventListener('click', (ev) => {
  if (ev.target.matches('.tab-btn')) {
    document.querySelectorAll('.tab-pane').forEach(n=>n.classList.add('hidden'));
    const tab = ev.target.dataset.tab;
    show(tab);
  }
});

/* ---------------------------
   Auth flows
   --------------------------- */
el('btn-login').addEventListener('click', async () => {
  const email = el('email').value;
  const pw = el('password').value;
  try { await auth.signInWithEmailAndPassword(email,pw); }
  catch(e){ alert('Login Fehler: '+e.message) }
});
el('btn-register').addEventListener('click', async () => {
  const email = el('email').value;
  const pw = el('password').value;
  try {
    const cred = await auth.createUserWithEmailAndPassword(email,pw);
    // create user doc
    await db.collection('users').doc(cred.user.uid).set({
      email, displayName: email.split('@')[0], isAdmin: false, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch(e){ alert('Registrieren Fehler: '+e.message) }
});
el('logout-btn').addEventListener('click', ()=>auth.signOut());

auth.onAuthStateChanged(async user => {
  if (user) {
    el('user-email').textContent = user.email;
    hide('auth-section');
    show('tabs');
    // show default tab
    show('season');
    await loadCurrentUser();
    await loadSeasonsAndData();
  } else {
    el('user-email').textContent = '';
    show('auth-section');
    hide('tabs');
    document.querySelectorAll('.tab-pane').forEach(n=>n.classList.add('hidden'));
  }
});

/* ---------------------------
   Data Helpers & Model
   --------------------------- */
let currentUserDoc = null;
async function loadCurrentUser(){
  const uid = auth.currentUser.uid;
  const snap = await db.collection('users').doc(uid).get();
  currentUserDoc = snap.exists ? snap.data() : null;
  // Render account ui
  el('displayName').value = currentUserDoc?.displayName || '';
  renderDeckForms();
}

/* ---------------------------
   Deck forms (Konto Tab)
   --------------------------- */
async function renderDeckForms(){
  const uid = auth.currentUser.uid;
  const decksSnap = await db.collection('decks').where('userId','==',uid).get();
  const container = el('deck-forms');
  container.innerHTML = '';
  decksSnap.forEach(doc => {
    const d = doc.data();
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <input class="deckname" data-id="${doc.id}" value="${d.deckName||''}" placeholder="Deck Name" />
      <input class="commander" data-id="${doc.id}" value="${d.commanderName||''}" placeholder="Commander (Scryfall Name)" />
      <input class="archidekt" data-id="${doc.id}" value="${d.archidektUrl||''}" placeholder="Archidekt Link" />
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
  const doc = await db.collection('decks').add({
    userId: uid, deckName: '', archidektUrl: '', commanderName: '', commanderScryfallId: '', commanderImageUrl: '', lockedSeasonId: null
  });
  renderDeckForms();
});

/* Save / Remove Deck (event delegation) */
document.addEventListener('click', async (ev) => {
  if (ev.target.matches('.save-deck')) {
    const id = ev.target.dataset.id;
    const card = ev.target.closest('.card');
    const deckName = card.querySelector('.deckname').value;
    const commander = card.querySelector('.commander').value;
    const archidekt = card.querySelector('.archidekt').value;
    await db.collection('decks').doc(id).update({ deckName, commanderName: commander, archidektUrl: archidekt });
    alert('Deck gespeichert (Commander Name ggf. Scryfall manuell ergänzen).');
  } else if (ev.target.matches('.remove-deck')) {
    const id = ev.target.dataset.id;
    if (!confirm('Deck entfernen?')) return;
    await db.collection('decks').doc(id).delete();
    renderDeckForms();
  }
});

/* ---------------------------
   Admin: Create season & select players
   --------------------------- */
el('create-season').addEventListener('click', async () => {
  const name = el('season-name').value || `Season ${new Date().toISOString().slice(0,10)}`;
  const startDate = el('season-start').value ? new Date(el('season-start').value) : new Date();
  const roundLen = parseInt(el('round-length').value || '14',10);
  const ref = await db.collection('seasons').add({
    name, startDate: firebase.firestore.Timestamp.fromDate(startDate), roundLengthDays: roundLen, status: 'planned', createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  alert('Season erstellt. Wähle nun Spieler und generiere Spielplan.');
  // reload players list
  await loadPlayerSelect(ref.id);
});

async function loadPlayerSelect(seasonId){
  const usersSnap = await db.collection('users').get();
  const container = el('player-select');
  container.innerHTML = `<h4>Spieler auswählen für Season</h4><div id="player-checks"></div>`;
  usersSnap.forEach(u => {
    const d = u.data();
    const id = u.id;
    const row = document.createElement('div');
    row.innerHTML = `<label><input type="checkbox" data-uid="${id}" /> ${d.displayName || d.email}</label>`;
    container.querySelector('#player-checks').appendChild(row);
  });
  // Save selections -> generate schedule button will read them
}

/* ---------------------------
   Generate Round-Robin (Hin+Rück)
   --------------------------- */
function roundRobinPairs(players) {
  // players: array of ids
  const n = players.length;
  const list = players.slice();
  const hasBye = (n % 2 === 1);
  if (hasBye) list.push(null); // null = bye
  const rounds = [];
  const m = list.length;
  for (let r=0; r<m-1; r++) {
    const pairs = [];
    for (let i=0; i<m/2; i++) {
      const a = list[i];
      const b = list[m-1-i];
      if (a !== null && b !== null) pairs.push([a,b]);
    }
    rounds.push(pairs);
    // rotate (keep first fixed)
    list.splice(1,0,list.pop());
  }
  return rounds;
}

el('generate-schedule').addEventListener('click', async () => {
  // find selected season
  // For simplicity: pick last created season (demo)
  const seasonsSnap = await db.collection('seasons').orderBy('createdAt','desc').limit(1).get();
  if (seasonsSnap.empty) { alert('Keine Season gefunden.'); return; }
  const seasonDoc = seasonsSnap.docs[0];
  const season = {...seasonDoc.data(), id: seasonDoc.id};
  // gather selected players (checkboxes)
  const checks = document.querySelectorAll('#player-select input[type=checkbox]');
  const selected = [];
  checks.forEach(ch => { if (ch.checked) selected.push(ch.dataset.uid); });
  if (selected.length < 2) { alert('Mind. 2 Spieler benötigt.'); return; }
  // generate pairs
  const rounds = roundRobinPairs(selected); // array of rounds (Hin)
  // create matches in Firestore (Hin)
  let roundNumber = 1;
  for (const r of rounds) {
    const startDate = new Date(season.startDate.toDate()); // season.startDate is Timestamp
    startDate.setDate(startDate.getDate() + (roundNumber-1) * season.roundLengthDays);
    for (const p of r) {
      await db.collection('matches').add({
        seasonId: season.id, roundNumber, homeUserId: p[0], awayUserId: p[1],
        scheduledDate: firebase.firestore.Timestamp.fromDate(startDate), completed: false
      });
    }
    roundNumber++;
  }
  // Rückrunde: swap home/away
  const hinRoundsCount = rounds.length;
  for (let rIndex=0; rIndex<hinRoundsCount; rIndex++) {
    const r = rounds[rIndex];
    const roundNum = roundNumber;
    const startDate = new Date(season.startDate.toDate());
    startDate.setDate(startDate.getDate() + (roundNum-1) * season.roundLengthDays);
    for (const p of r) {
      await db.collection('matches').add({
        seasonId: season.id, roundNumber: roundNum, homeUserId: p[1], awayUserId: p[0],
        scheduledDate: firebase.firestore.Timestamp.fromDate(startDate), completed: false
      });
    }
    roundNumber++;
  }
  alert('Spielplan generiert (Hin + Rück).');
});

/* ---------------------------
   Matches & Result Entry (simplified)
   --------------------------- */
async function loadMatchesForSeason(seasonId) {
  const snap = await db.collection('matches').where('seasonId','==',seasonId).orderBy('roundNumber').get();
  const container = el('matches-list');
  container.innerHTML = '';
  for (const doc of snap.docs) {
    const m = doc.data();
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `<strong>Runde ${m.roundNumber}</strong><div>${m.homeUserId} vs ${m.awayUserId}</div>
      <div>Datum: ${m.scheduledDate?.toDate?.().toLocaleDateString()}</div>
      <div><button class="enter-result btn" data-id="${doc.id}">Resultat erfassen</button></div>
    `;
    container.appendChild(div);
  }
}

/* Enter result - shows a prompt flow (simplified) */
document.addEventListener('click', async (ev) => {
  if (ev.target.matches('.enter-result')) {
    const matchId = ev.target.dataset.id;
    // fetch match + players
    const matchDoc = await db.collection('matches').doc(matchId).get();
    const match = matchDoc.data();
    // load each player's decks
    const homeDeckSnap = await db.collection('decks').where('userId','==',match.homeUserId).get();
    const awayDeckSnap = await db.collection('decks').where('userId','==',match.awayUserId).get();
    const homeDecks = homeDeckSnap.docs.map(d=>({id:d.id, ...d.data()}));
    const awayDecks = awayDeckSnap.docs.map(d=>({id:d.id, ...d.data()}));
    // Very basic prompt UI: choose per game which deck used and winner
    // For demo: assume 2-0 home or 2-0 away or 2-1 etc.
    const res = prompt('Gib Ergebnis ein (z.B. 2:0 oder 2:1)');
    if (!res) return;
    const parts = res.split(':').map(x=>parseInt(x,10));
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) { alert('Ungültiges Format.'); return; }
    const homeWins = parts[0], awayWins = parts[1];

    // Determine points
    let homePts=0, awayPts=0;
    if (homeWins === 2 && awayWins === 0) { homePts=3; awayPts=0;}
    else if (homeWins === 2 && awayWins === 1) { homePts=2; awayPts=1;}
    else if (homeWins === 1 && awayWins === 2) { homePts=1; awayPts=2;}
    else if (homeWins === 0 && awayWins === 2) { homePts=0; awayPts=3;}
    else { alert('Ungültiges Match Ergebnis.'); return; }

    // Save match summary
    await db.collection('matches').doc(matchId).update({ completed: true, result: `${homeWins}:${awayWins}`, homePoints: homePts, awayPoints: awayPts });
    alert('Resultat gespeichert (Demo). Für volle Game‑level Erfassung müsste UI erweitert werden.');
  }
});

/* ---------------------------
   Simple Standings compute (client-side)
   --------------------------- */
async function computeStandings(seasonId){
  const matchesSnap = await db.collection('matches').where('seasonId','==',seasonId).get();
  const table = {};
  matchesSnap.forEach(mdoc => {
    const m = mdoc.data();
    if (!table[m.homeUserId]) table[m.homeUserId] = {points:0, gamesWon:0, gamesLost:0, matchWins:0};
    if (!table[m.awayUserId]) table[m.awayUserId] = {points:0, gamesWon:0, gamesLost:0, matchWins:0};
    if (m.homePoints !== undefined) {
      table[m.homeUserId].points += m.homePoints;
      table[m.awayUserId].points += m.awayPoints;
      // quick parse games from result
      if (m.result) {
        const [hw,aw] = m.result.split(':').map(x=>parseInt(x,10));
        table[m.homeUserId].gamesWon += hw; table[m.homeUserId].gamesLost += aw;
        table[m.awayUserId].gamesWon += aw; table[m.awayUserId].gamesLost += hw;
        if (hw > aw) table[m.homeUserId].matchWins += 1; else table[m.awayUserId].matchWins += 1;
      }
    }
  });
  // build sorted array
  const arr = Object.keys(table).map(uid => ({uid, ...table[uid]}));
  arr.sort((a,b) => {
    if (b.points !== a.points) return b.points - a.points;
    const aDiff = a.gamesWon - a.gamesLost;
    const bDiff = b.gamesWon - b.gamesLost;
    if (bDiff !== aDiff) return bDiff - aDiff;
    return b.matchWins - a.matchWins;
  });
  return arr;
}

/* ---------------------------
   Minimal misc: load last season and show standings
   --------------------------- */
async function loadSeasonsAndData(){
  const seasonsSnap = await db.collection('seasons').orderBy('createdAt','desc').limit(1).get();
  if (seasonsSnap.empty) return;
  const season = seasonsSnap.docs[0];
  show('season');
  const standings = await computeStandings(season.id);
  const container = el('standings');
  container.innerHTML = '<ol>' + standings.map(s=>`<li>${s.uid}: ${s.points} pts (GDiff:${s.gamesWon - s.gamesLost})</li>`).join('') + '</ol>';
  // also load matches
  await loadMatchesForSeason(season.id);
}

/* ---------------------------
   Scryfall lookup sample
   --------------------------- */
async function scryfallLookup(name){
  const q = encodeURIComponent(name);
  const url = `https://api.scryfall.com/cards/named?fuzzy=${q}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Scryfall nicht gefunden');
  return await r.json();
}

/* ---------------------------
   Profile save / delete
   --------------------------- */
el('save-profile').addEventListener('click', async () => {
  const uid = auth.currentUser.uid;
  const displayName = el('displayName').value;
  await db.collection('users').doc(uid).update({ displayName });
  alert('Profil gespeichert');
});
el('delete-account').addEventListener('click', async () => {
  if (!confirm('Konto wirklich löschen? Diese Aktion ist permanent.')) return;
  const uid = auth.currentUser.uid;
  // Delete data (simple, might need more cleanup)
  await db.collection('users').doc(uid).delete();
  // Note: Auth deletion needs user re-auth; we log out instruct user to delete manually in Auth Console.
  alert('Benutzerdaten entfernt. Bitte lösche Auth Account in Firebase Console oder melde dich ab und kontaktiere Admin.');
});
