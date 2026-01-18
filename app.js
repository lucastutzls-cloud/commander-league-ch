// app.js: sichere Firebase-Init + generate-schedule (batch)
// ERSETZE firebaseConfig mit deinen Projektdaten.

(function(){
  // CONFIG: Bitte hier deine Firebase-Konfiguration eintragen
  const firebaseConfig = {
  apiKey: "AIzaSyCOyHrZXJkJtS2UzddH0sCN_NzRiILIheI",
  authDomain: "commanderleague-ch.firebaseapp.com",
  projectId: "commanderleague-ch",
  storageBucket: "commanderleague-ch.firebasestorage.app",
  messagingSenderId: "343380146333",
  appId: "1:343380146333:web:b1553bdc651482c062bc74",
  measurementId: "G-TJP8BYHC0F"
  };

  function fatal(msg){
    console.error('Firebase init error:', msg);
    alert('Fehler: ' + msg + '\nSiehe Konsole für Details.');
  }

  // Warte, bis DOM ready ist (sicherer als load für script-Reihenfolge)
  document.addEventListener('DOMContentLoaded', async () => {
    // 1) Prüfe, ob firebase SDKs geladen sind
    if (typeof firebase === 'undefined') {
      fatal('Firebase SDK nicht gefunden. Stelle sicher, dass die Firebase-Skripte vor app.js eingebunden sind.');
      return;
    }
    if (!firebase.apps || typeof firebase.initializeApp !== 'function') {
      fatal('Firebase SDK nicht korrekt geladen (initializeApp fehlt).');
      return;
    }

    // 2) Init (falls noch nicht)
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log('Firebase initialized.');
      } else {
        console.log('Firebase app already initialized.');
      }
    } catch (err) {
      fatal('Beim Initialisieren von Firebase ist ein Fehler aufgetreten: ' + (err && err.message ? err.message : err));
      return;
    }

    // 3) setze globale Handles
    try {
      window.db = firebase.firestore();
      window.storage = firebase.storage();
      // für konsolen-quickcheck
      console.log('window.db und window.storage gesetzt', window.db ? true : false);
    } catch (err) {
      fatal('Firestore/Storage initialisierung fehlgeschlagen: ' + (err && err.message ? err.message : err));
      return;
    }

    // 4) Hilfsfunktion: Round Robin (falls benötigt)
    window.roundRobinPairs = function(players) {
      const list = players.slice();
      const n = list.length;
      const isOdd = (n % 2 === 1);
      if (isOdd) list.push(null);
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
        const last = list.pop();
        list.splice(1, 0, last);
      }
      return rounds;
    };

    // 5) generate-schedule handler (wie zuvor, registrieren NACH db vorhanden)
    const btn = document.getElementById('generate-schedule');
    if (btn) {
      btn.addEventListener('click', async () => {
        try {
          btn.disabled = true;
          btn.textContent = 'Generiere Spielplan…';

          // hole neuste Season
          const seasonsSnap = await db.collection('seasons').orderBy('createdAt', 'desc').limit(1).get();
          if (seasonsSnap.empty) { alert('Keine Season gefunden.'); return; }
          const seasonDoc = seasonsSnap.docs[0];
          const season = { ...seasonDoc.data(), id: seasonDoc.id };

          // ausgewählte Spieler
          const checks = document.querySelectorAll('#player-select input[type=checkbox]');
          const selected = []; checks.forEach(ch => { if (ch.checked) selected.push(ch.dataset.uid); });
          if (selected.length < 2) { alert('Mind. 2 Spieler benötigt.'); return; }

          // idempotency: existierende Matches prüfen
          const existingMatchSnap = await db.collection('matches').where('seasonId','==', season.id).limit(1).get();
          if (!existingMatchSnap.empty) {
            alert('Für diese Season existieren bereits Matches. Abbruch, um Duplikate zu vermeiden.');
            return;
          }

          // vorhandene seasonPlayers prüfen
          const spSnap = await db.collection('seasonPlayers').where('seasonId', '==', season.id).get();
          const existingPlayerSet = new Set(spSnap.docs.map(d => d.data().userId));

          const writeOps = [];

          // seasonPlayers ergänzen
          for (const uid of selected) {
            if (!existingPlayerSet.has(uid)) {
              const ref = db.collection('seasonPlayers').doc();
              writeOps.push({ ref, data: { seasonId: season.id, userId: uid, active: true, createdAt: firebase.firestore.FieldValue.serverTimestamp() }});
            }
          }

          // Runden erzeugen
          const rounds = window.roundRobinPairs(selected);
          const totalRounds = rounds.length;
          const roundLengthDays = (season.roundLengthDays && Number(season.roundLengthDays)) || 7;
          let baseDate = new Date();
          if (season.startDate) {
            if (season.startDate.toDate) baseDate = season.startDate.toDate();
            else baseDate = new Date(season.startDate);
          }
          const addDays = (d, days) => { const n = new Date(d); n.setDate(n.getDate() + days); return n; };

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

          // Rückrunde
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

          // commit in batches
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
    } else {
      console.warn('Button #generate-schedule nicht gefunden. Überspringe Handler-Registrierung.');
    }

    // Optional: Log zum Debuggen
    console.log('app.js init complete. Firebase app:', firebase.apps.length ? firebase.apps[0].name : '(none)');
  });
})();
