# Commander League — Starter Repo (HTML + Firebase, compat)

Diese Anleitung erklärt Schritt‑für‑Schritt, wie du das Starter‑Projekt betreibst: Firebase konfigurieren, Admin anlegen, deployen (Netlify/GitHub Pages) und die wichtigsten Tests durchführen.

WICHTIG: Ersetze in app.js das `firebaseConfig`-Objekt mit den Werten aus deinem Firebase‑Projekt.

1) Dateien ins Repo hochladen
- Lege ein neues GitHub‑Repo an (z. B. commander-league).
- Lade alle Dateien hoch: index.html, styles.css, app.js, logo.png, favicon.ico, README.md.
- Oder lokal:
  git init
  git add .
  git commit -m "Initial commit"
  git branch -M main
  git remote add origin https://github.com/DEIN_USERNAME/REPO.git
  git push -u origin main

2) Firebase Projekt erstellen
- Gehe zu https://console.firebase.google.com
- Neues Projekt anlegen (z. B. CommanderLeague)
- In Project settings → "Your apps" → Web App hinzufügen (</>) → Namen vergeben → Register app
- Kopiere das firebaseConfig-Objekt (apiKey, authDomain, projectId, ...)

3) firebaseConfig in app.js eintragen
- Öffne app.js und ersetze das placeholder-Objekt `firebaseConfig = { ... }` mit dem Objekt aus Firebase.
- Speichere, committe und pushe die Änderung.

4) Firestore / Auth / Storage aktivieren
- In Firebase Console:
  - Authentication → Sign‑in method → Email/Password aktivieren
  - Firestore Database → Create database → Start in Test mode (für Entwicklung)
  - Storage → optional (für Bilder)

5) Firestore Security Rules setzen (Entwicklung)
- Firestore → Rules → ersetze mit dem provided firebase.rules (siehe Datei firebase.rules).
- Klicke "Publish".

6) Admin‑User anlegen
- Authentication → Users → Add user:
  - Email: lucastutz.ls@gmail.com
  - Password: (temporär)
- Kopiere die UID des Users (öffne den User und sieh die UID).
- Firestore → Data → Start collection:
  - Collection ID: users
  - Document ID: <UID aus Auth>
  - Felder:
    - email (string): lucastutz.ls@gmail.com
    - displayName (string): Lucas
    - isAdmin (boolean): true
    - createdAt (timestamp): now

7) Deploy (Netlify empfohlen)
- Netlify: https://app.netlify.com → New site from Git → connect GitHub → wähle Repo → Deploy.
- Oder GitHub Pages: Repo → Settings → Pages → choose branch main → Save.

8) Testen
- Öffne die veröffentlichte URL.
- Login mit lucastutz.ls@gmail.com (oder registriere neu über das UI).
- Als Admin: Season erstellen → Spieler auswählen → Spielplan generieren → Resultat erfassen.
- Prüfe Firestore collections: users, decks, seasons, matches.

9) Häufige Probleme + Lösungen
- app.js liefert HTML / SyntaxError: Stelle sicher, dass du keine `import` Zeilen in app.js hast und die compat-CDN-Skripte in index.html stehen.
- 404 logo.png: Datei nicht im Root / falscher Pfad → lege logo.png ins gleiche Verzeichnis wie index.html oder passe src an.
- permission-denied (Firestore): Prüfe Firestore Rules + ob user in Auth eingeloggt ist und users/{uid} existiert.

10) Optionale Erweiterungen
- Game‑level Resultate UI: replace prompt with form selecting deck per game (erfordert zusätzliche UI)
- Server-seitige Validierung (Cloud Functions): z. B. Deck‑only-once-per-match check, max 3 decks validation
- E‑Mail Notifications: Firebase Extension SendGrid oder Zapier/Make

Wenn du möchtest, helfe ich dir live: ich kann prüfen, wenn du die Staging‑URL postest oder dir die genauen Schritte für Netlify-Deploy und die erste Anmeldung zeigen.
