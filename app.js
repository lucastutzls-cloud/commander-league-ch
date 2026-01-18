// app.js: Firebase init, roundRobinPairs, generate-schedule (batch, idempotent)
// Replace the firebaseConfig object with your project's config.

window.addEventListener('load', () => {
  // --- CONFIG: REPLACE these values with your Firebase project config ---
  const firebaseConfig = {
  apiKey: "AIzaSyCOyHrZXJkJtS2UzddH0sCN_NzRiILIheI",
  authDomain: "commanderleague-ch.firebaseapp.com",
  projectId: "commanderleague-ch",
  storageBucket: "commanderleague-ch.firebasestorage.app",
  messagingSenderId: "343380146333",
  appId: "1:343380146333:web:b1553bdc651482c062bc74",
  measurementId: "G-TJP8BYHC0F"
  };
  // ---------------------------------------------------------------------

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  } else {
    firebase.app();
  }

  // make db/global available
  window.db = firebase.firestore();
  // optional: enable timestampsInSnapshots not required for v8
  // firebase.firestore().settings({ timestampsInSnapshots: true });

  // --- roundRobinPairs(players) ---
  // Returns array of rounds, each round is array of pairs [ [a,b], [c,d], ... ]
  window.roundRobinPairs = function(players) {
    const list = players.slice();
    const n = list.length;
    const isOdd = (n % 2 === 1);
    if (isOdd) list.push(null); // bye placeholder
    const m = list.length;
    const rounds = [];
    for (let r = 0; r < m - 1; r++) {
      const pairs = [];
      for (let i = 0; i < m / 2; i++) {
        const a = list[i];
        const b = list[m - 1 - i];
        if (a !== null && b !== null) pairs.push([a, b]);
      }
      rounds.push(pairs);
      // rotate (keeping first element fixed)
      const last = list.pop();
      list.splice(1, 0, last);
    }
    return rounds;
  };

  // --- generate-schedule handler (batch writes, idempotent) ---
  document.getElementById('generate-schedule')?.addEventListener('click', async () => {
    const btn = document.getElementById('generate-schedule');
    try {
      btn.disabled = true;
      btn.textContent = 'Generiere Spielplan…';

      // get latest season
      const seasonsSnap = await db.collection('seasons').orderBy('createdAt', 'desc').limit(1).get();
      if (seasonsSnap.empty) { alert('Keine Season gefunden.'); return; }
      const seasonDoc = seasonsSnap.docs[0];
      const season = { ...seasonDoc.data(), id: seasonDoc.id };

      // selected players
      const checks = document.querySelectorAll('#player-select input[type=checkbox]');
      const selected = []; checks.forEach(ch => { if (ch.checked) selected.push(ch.dataset.uid); });
      if (selected.length < 2) { alert('Mind. 2 Spieler benötigt.'); return; }

      // idempotency: check if matches exist already
      const existingMatchSnap = await db.collection('matches').where('seasonId','==', season.id).limit(1).get();
      if (!existingMatchSnap.empty) {
        alert('Für diese Season existieren bereits Matches. Abbruch, um Duplikate zu vermeiden.');
        return;
      }

      // existing seasonPlayers for season
      const spSnap = await db.collection('seasonPlayers').where('seasonId', '==', season.id).get();
      const existingPlayerSet = new Set(spSnap.docs.map(d => d.data().userId));

      const writeOps = [];

      // add seasonPlayers (avoid duplicates)
      for (const uid of selected) {
        if (!existingPlayerSet.has(uid)) {
          const ref = db.collection('seasonPlayers').doc();
          writeOps.push({ ref, data: { seasonId: season.id, userId: uid, active: true, createdAt: firebase.firestore.FieldValue.serverTimestamp() }});
        }
      }

      // prepare rounds
      const rounds = window.roundRobinPairs(selected);
      const totalRounds = rounds.length;
      const roundLengthDays = (season.roundLengthDays && Number(season.roundLengthDays)) || 7;
      let baseDate = new Date();
      if (season.startDate) {
        if (season.startDate.toDate) baseDate = season.startDate.toDate();
        else baseDate = new Date(season.startDate);
      }
      const addDays = (d, days) => {
        const n = new Date(d);
        n.setDate(n.getDate() + days);
        return n;
      };

      let roundNumber = 1;
      for (const r of rounds) {
        const startDate = addDays(baseDate, (roundNumber - 1) * roundLengthDays);
        for (const pair of r) {
          const home = pair[0], away = pair[1];
          const ref = db.collection('matches').doc();
          writeOps.push({
            ref,
            data: {
              seasonId: season.id,
              roundNumber,
              homeUserId: home,
              awayUserId: away,
              scheduledDate: firebase.firestore.Timestamp.fromDate(startDate),
              completed: false,
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }
          });
        }
        roundNumber++;
      }

      // second leg
      const secondLegOffsetDays = totalRounds * roundLengthDays;
      roundNumber = 1;
      for (const r of rounds) {
        const startDate = addDays(baseDate, secondLegOffsetDays + (roundNumber - 1) * roundLengthDays);
        for (const pair of r) {
          const home = pair[1], away = pair[0];
          const ref = db.collection('matches').doc();
          writeOps.push({
            ref,
            data: {
              seasonId: season.id,
              roundNumber: totalRounds + roundNumber,
              homeUserId: home,
              awayUserId: away,
              scheduledDate: firebase.firestore.Timestamp.fromDate(startDate),
              completed: false,
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }
          });
        }
        roundNumber++;
      }

      // commit in batches (chunk < 500)
      const commitInBatches = async (ops, chunkSize = 400) => {
        for (let i = 0; i < ops.length; i += chunkSize) {
          const chunk = ops.slice(i, i + chunkSize);
          const batch = db.batch();
          for (const op of chunk) batch.set(op.ref, op.data);
          await batch.commit();
          console.log(`Committed batch ${Math.floor(i / chunkSize) + 1} (${chunk.length} writes)`);
        }
      };

      await commitInBatches(writeOps);

      // mark season
      await db.collection('seasons').doc(season.id).update({
        scheduleGenerated: true,
        scheduleGeneratedAt: firebase.firestore.FieldValue.serverTimestamp(),
        scheduleGeneratedBy: firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
      });

      alert('Spielplan generiert (Hin + Rück).');

    } catch (err) {
      console.error('Fehler bei Spielplan‑Generierung:', err);
      alert('Fehler: ' + (err && err.message ? err.message : err));
    } finally {
      btn.disabled = false;
      btn.textContent = 'Spielplan generieren';
    }
  });
});
