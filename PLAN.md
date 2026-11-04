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
10. Supabase-Projekt anlegen (Gratis-Tarif). **Das musst du selbst tun**, ich leite dich an.
11. GitHub-Konto und Repository anlegen (selbst, mit Anleitung). Supabase-Keys als GitHub Secrets hinterlegen.
12. Datenbankschema: Werke, Ausgaben, Genres, Genre-Zuordnungstabelle. Suchindex mit `pg_trgm`, Leserechte über Row Level Security.
13. Import-Skript für GitHub Actions: DNB seitenweise abrufen, filtern, zu Werken gruppieren, Genre bestimmen, Cover-Quelle ermitteln. Fortsetzbar bei Abbruch.
14. Erstimport durchführen und Speicherverbrauch prüfen (Ziel unter ~350 MB).
15. PWA auf Supabase als Datenquelle umstellen. Die DNB bleibt nur für ISBN-Suchen außerhalb des Katalogs.
16. GitHub Actions für die monatliche Aktualisierung und gegen das Pausieren.
17. Genre-Zuordnungstabelle gemeinsam durchgehen und korrigieren.

## Phase 3 – Aufs Handy
18. Veröffentlichen auf GitHub Pages.
19. Auf dem Handy testen und zum Startbildschirm hinzufügen.

## Phase 4 – Später
- Stöbern nach Autor und Genre zur Inspiration.
- Sammelbände/Gesamtausgaben (z. B. „4192 Seiten“) aus den Ausgaben eines Einzelbandes heraushalten.
- Suche verfeinern: „George R R Martin“ zeigt Robin Hobb vor Martin. Einzelbuchstaben („R“) passen bisher als Teilwort auf fast alles. Initialen und Wortanfänge sauber behandeln, Autorentreffer besser gewichten.
- Barcode-Scan mit der Handykamera.
- Abgleich der Markierungen zwischen Geräten über Supabase mit Anmeldung.
- Weitere Sachgruppen freischalten, z. B. Geschichte (`900`): Konfiguration ergänzen und den Import für diesen Bereich laufen lassen.
