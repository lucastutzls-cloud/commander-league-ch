// generate-schedule: Batch-fähige, idempotente Implementierung
document.getElementById('generate-schedule').addEventListener('click', async () => {
  try {
    const btn = document.getElementById('generate-schedule');
    btn.disabled = true;
    btn.textContent = 'Generiere Spielplan…';

    // 1) hole neuste Season
    const seasonsSnap = await db.collection('seasons').orderBy('createdAt', 'desc').limit(1).get();
    if (seasonsSnap.empty) { alert('Keine Season gefunden.'); btn.disabled = false; btn.textContent = 'Spielplan generieren'; return; }
    const seasonDoc = seasonsSnap.docs[0];
    const season = { ...seasonDoc.data(), id: seasonDoc.id };

    // 2) Spieler auswählen
    const checks = document.querySelectorAll('#player-select input[type=checkbox]');
    const selected = [];
    checks.forEach(ch => { if (ch.checked) selected.push(ch.dataset.uid); });
    if (selected.length < 2) { alert('Mind. 2 Spieler benötigt.'); btn.disabled = false; btn.textContent = 'Spielplan generieren'; return; }

    // 3) Schutz: existierende Matches prüfen (idempotency)
    const existingMatchSnap = await db.collection('matches').where('seasonId', '==', season.id).limit(1).get();
    if (!existingMatchSnap.empty) {
      alert('Für diese Season existieren bereits Matches. Abbruch, um Duplikate zu vermeiden.');
      btn.disabled = false; btn.textContent = 'Spielplan generieren';
      return;
    }

    // 4) hole vorhandene seasonPlayers für diese Season, um Duplikate zu vermeiden
    const spSnap = await db.collection('seasonPlayers').where('seasonId', '==', season.id).get();
    const existingPlayerSet = new Set(spSnap.docs.map(d => d.data().userId));

    // 5) erstelle ops-Array mit allen zu schreibenden Dokumenten (seasonPlayers + matches)
    const writeOps = [];

    // seasonPlayers: nur hinzufügen, wenn nicht vorhanden
    for (const uid of selected) {
      if (!existingPlayerSet.has(uid)) {
        const ref = db.collection('seasonPlayers').doc();
        writeOps.push({ ref, data: { seasonId: season.id, userId: uid, active: true } });
      }
    }

    // 6) Matches: Runde berechnen (Hin + Rück)
    const rounds = roundRobinPairs(selected); // erwartet array of pair arrays [[a,b],[c,d],...]
    const totalRounds = rounds.length;

    // konfig: Startdatum und Länge pro Runde (fallbacks)
    const roundLengthDays = (season.roundLengthDays && Number(season.roundLengthDays)) || 7;
    let baseDate = new Date();
    if (season.startDate) {
      // Falls startDate ein Firestore Timestamp ist:
      if (season.startDate.toDate) baseDate = season.startDate.toDate();
      else baseDate = new Date(season.startDate);
    }

    // Hilfsfunktion: add days
    const addDays = (d, days) => {
      const n = new Date(d);
      n.setDate(n.getDate() + days);
      return n;
    };

    let roundNumber = 1;
    for (const r of rounds) {
      // Für jede Runde: erstelle Hinspiele an Datum = base + (roundNumber-1)*roundLengthDays
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

    // Rückrunde: gleiche Reihenfolge, aber zuhause/auswärts getauscht und zeitversetzt um totalRounds * roundLengthDays
    const secondLegOffsetDays = totalRounds * roundLengthDays;
    roundNumber = 1;
    for (const r of rounds) {
      const startDate = addDays(baseDate, secondLegOffsetDays + (roundNumber - 1) * roundLengthDays);
      for (const pair of r) {
        const home = pair[1], away = pair[0]; // swap for return leg
        const ref = db.collection('matches').doc();
        writeOps.push({
          ref,
          data: {
            seasonId: season.id,
            roundNumber: totalRounds + roundNumber, // numbering continues after first leg
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

    // 7) Helper: commit in Batches (limit sicher < 500, hier 400)
    const commitInBatches = async (ops, chunkSize = 400) => {
      for (let i = 0; i < ops.length; i += chunkSize) {
        const chunk = ops.slice(i, i + chunkSize);
        const batch = db.batch();
        for (const op of chunk) {
          batch.set(op.ref, op.data);
        }
        await batch.commit();
        console.log(`Committed batch ${Math.floor(i / chunkSize) + 1} (${chunk.length} writes)`);
      }
    };

    // 8) Führe die Writes aus
    await commitInBatches(writeOps);

    // 9) Markiere Season als generiert (audit)
    await db.collection('seasons').doc(season.id).update({
      scheduleGenerated: true,
      scheduleGeneratedAt: firebase.firestore.FieldValue.serverTimestamp(),
      scheduleGeneratedBy: firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
    });

    alert('Spielplan generiert (Hin + Rück).');
    console.log('Schedule generation finished. Total writes:', writeOps.length);

  } catch (err) {
    console.error('Fehler bei Spielplan‑Generierung:', err);
    alert('Fehler: ' + (err.message || err));
  } finally {
    const btn = document.getElementById('generate-schedule');
    if (btn) { btn.disabled = false; btn.textContent = 'Spielplan generieren'; }
  }
});
