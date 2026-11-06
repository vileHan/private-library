# Ausbauplan

Die Entscheidungen und Details stehen in [CLAUDE.md](CLAUDE.md).

## Phase 1 – Grundgerüst: Suchen und Markieren (zunächst live von der DNB) ✅ erledigt (04.11.2026)
1. PWA-Grundgerüst: `index.html`, Styles, App-Manifest, Icon, Service Worker.
2. Katalog-Schnittstelle in der App (`searchCatalog`, `getByIsbn`), zuerst mit DNB live dahinter.
3. DNB-Anbindung: Titelsuche mit den Filtern, MARC21 auswerten, seitenweise laden. ISBN-Suche läuft ohne Filter.
4. Cover: Open Library, sonst Google Books, sonst Platzhalter. Der DNB-Coverdienst fällt weg, weil er eine Bot-Prüfung vorschaltet.
5. Ausgaben zu Werken gruppieren (Autor + normalisierter Titel).
6. Trefferliste: eigene Bücher oben, darunter der Rest, jeweils A–Z. Nicht besessene ausgegraut.
7. Markierungen „besitze ich“ und „gelesen“ in IndexedDB.
8. Ansicht „Meine Bibliothek“ mit Suche und Sortierung nach Titel, Autor und Jahr.
9. Backup: Export und Import als JSON.

## Phase 1b – Zusatzfunktionen ✅ erledigt (04.11.2026)
- Merkliste, Bewertung, Lesedatum, Notiz, eigene Regale
- Reihen-Ansicht mit fehlenden Bänden
- Statistik

## Phase 2 – Eigene Katalog-Datenbank (Supabase)
10. ✅ Supabase-Projekt angelegt (Gratis-Tarif, Frankfurt), GitHub-Secret `SUPABASE_DB_URL` hinterlegt.
11. ✅ Schema: eine Tabelle `works`, Ausgaben als ISBN-Zahlen, Volltextindex, Leserechte über Row Level Security.
12. ✅ Import-Skript und Workflows (Import monatlich + manuell, wach halten alle 3 Tage).
13. ✅ Probeimport (Kinderbuch 2024) und Größenmessung: ~630 Byte je Werk.
14. ✅ Vollimport: 456.514 Werke, 213 MB (05.11.2026). Erster Versuch scheiterte am Arbeitsspeicher, zweiter nur am Aufräumschritt (Zeitgrenze) – beides behoben.
15. ✅ App nutzt die Datenbank (05.11.2026).
16. Genres: Werke ohne DNB-Gattungsbegriff über Open Library/Google ergänzen, Zuordnungstabelle gemeinsam durchgehen.

## Phase 3 – Aufs Handy
18. ✅ Veröffentlicht auf GitHub Pages: https://vilehan.github.io/private-library/ (04.11.2026)
19. Auf dem Handy testen und zum Startbildschirm hinzufügen.

## Phase 4 – Später
- Stöbern nach Autor und Genre zur Inspiration.
- Sammelbände/Gesamtausgaben (z. B. „4192 Seiten“) aus den Ausgaben eines Einzelbandes heraushalten.
- ✅ Suche verfeinert: Initialen werden ignoriert, lange Werbe-Untertitel zählen nicht (George R R Martin).
- Barcode-Scan mit der Handykamera.
- Abgleich der Markierungen zwischen Geräten über Supabase mit Anmeldung.
- **Überlegung Konten (06.11.2026)**: Konten für mich, Familie und Freunde (10–20 Personen). Machbar und kostenlos:
  - Supabase Auth (Gratis-Tarif bis 50.000 aktive Nutzer/Monat). Anmeldung per E-Mail-Link oder E-Mail + Passwort.
  - Achtung: Der eingebaute E-Mail-Versand von Supabase schafft nur wenige Mails pro Stunde. Für 20 Personen reicht das meist. Sonst einen kostenlosen Mail-Dienst anbinden (z. B. Brevo, 300 Mails/Tag).
  - Neue Tabelle `user_books` (Werk, Besitz, gelesen, Merken, Bewertung, Notiz …) mit Row Level Security: jeder sieht nur seine eigenen Einträge. Platz: 20 Personen × ~500 Bücher ≈ 3 MB.
  - Bringt automatisch den Abgleich zwischen Handy, Laptop usw. Bestehende Daten werden beim ersten Anmelden aus IndexedDB hochgeladen. Ohne Anmeldung funktioniert die App weiter wie bisher.
  - Später möglich: Familie/Freunde sehen gegenseitig ihre Bibliothek (z. B. „Wer hat das Buch schon?“).
  - Aufwand: ca. 4–6 Stunden. Offene Fragen: Wer darf sich registrieren (nur auf Einladung?), Anmeldung per Link oder Passwort?
- Weitere Sachgruppen freischalten, z. B. Geschichte (`900`): Konfiguration ergänzen und den Import für diesen Bereich laufen lassen.
