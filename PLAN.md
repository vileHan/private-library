# Offene Punkte

Nur was noch zu tun ist. Erledigtes steht in der Git-Historie, Entscheidungen und Details in [CLAUDE.md](CLAUDE.md),
prüfbare Anforderungen in [ANFORDERUNGEN.md](ANFORDERUNGEN.md). Stand: 09.11.2026.

## Als Nächstes (Reihenfolge vom Nutzer, 09.11.2026 – sobald wieder Tokens da sind)
1. ~~Wischen ab den Knöpfen verbessern~~ → 09.11.2026: Schalter beim Scrollen abgeschaltet, Fläche nur noch mittleres Drittel. Am iPhone nachprüfen.
2. ~~Feature-Analyse~~ → erledigt; gewählt B, C, F, H (+ Regal-Zeile), umgesetzt 09.11.2026. Übrige Ideen siehe unten.
3. Wenn dort nichts mehr gefällt: **diese Liste abarbeiten.**

## Feature-Ideen zur Auswahl (Analyse 09.11.2026, Vergleich Goodreads/StoryGraph/Hardcover/Bookly/Libib/Apple Books)
Alle kostenlos und lokal machbar (IndexedDB, vorhandener Katalog). Aufwand grob: S < 1 h, M 1–3 h, L > 3 h.
- **A Lesestatus „Lese ich gerade“ + Fortschritt** (Seite/Prozent, Startdatum) – alle großen Apps haben das; heute gibt es nur „gelesen“. M
- ~~B Abgebrochen~~ ✓ 09.11.2026
- ~~C Jahresziel~~ ✓ 09.11.2026
- **D Mehrfach gelesen** (Re-Reads mit mehreren Lesedaten). S–M
- **E „Neu in deinen Reihen / von deinen Autoren“**: Nach jedem Monatsimport zeigen, welche neuen Bände zu Reihen erschienen sind, von denen du Bände besitzt (Hardcover/StoryGraph haben Serien-Hinweise). M
- ~~F Zufallsbuch~~ ✓ 09.11.2026 (Ungelesen, Merkliste, Regal)
- **G Zitate/Lieblingsstellen** pro Buch speichern (Bookly, Goodreads). S
- ~~H Mehr Statistik~~ ✓ 09.11.2026
- **I „Mehr wie dieses“** im Detailblatt: beliebte Bücher aus gleichem Genre/Autor-Umfeld (aus der eigenen Datenbank). M
- **J Wunschliste teilen** (z. B. für Geschenke): Merkliste als Link, der die ISBNs im Link trägt – ohne Server, ohne Konto. M
- **K Import aus Goodreads/StoryGraph** (CSV-Export → eigene Bibliothek, Abgleich über ISBN). M
- ~~L zuletzt hinzugefügt~~ – gab es schon
- **M Leihe in Bibliotheken** (Onleihe-Suche als Link aus dem Detailblatt). S – nur Link, kein Abruf

## Mit dem Import am 01.12.2026 (automatisch, schon im Code)
- Pappbilderbücher (~5.900) und Spielleiter-Schirme fallen weg.
- Känguru-Reihe mit vollen Titeln und Band 1–5; Box-Bände ohne Autor werden eingegliedert.

## Entscheidungen des Nutzers
- **„Mein Kinderbuchhaus“** (Oetinger-Sammelreihe, 8 Autoren) als Verlagsreihe herausnehmen? Sonst zeigt „Pippi Langstrumpf“ nach dem Import „Band 5“. Kleine Regel in `isPublisherSeries`.

## Katalog
- **Reihen mit Unterreihen** („Die drei ??? Kids“: 186 Bände, „Band 1“ viermal – Blanck, Pfeiffer, „Mission …“): Reihenseite nach Autor/Unterreihe gruppieren? (Entscheidung des Nutzers)
- **Harry Potter**: Sammelband „I-VII“ und „Potter guides“ stehen in der Reihe – Regeln prüfen (nach dem Import am 01.12. nachsehen).
- Titel „Die drei? ?? Kids, Mission …“ (Fragezeichen zerlegt) aufräumen.
- **Genre für alte Bücher**: 2000–2011 fehlt bei ~80 % der Gattungsbegriff. Lösung: (a) Open-Library-Schlagworte (englisch) über eine Zuordnungstabelle ins Deutsche (passt zum Workflow „Cover-IDs“), (b) grobe Ersatzgruppe aus der Sachgruppe (B = Belletristik, K = Kinder-/Jugendbuch) fürs Stöbern. Zuordnungstabelle danach gemeinsam durchgehen.
- **Sammelbände/Gesamtausgaben** (z. B. „4192 Seiten“) aus den Ausgaben eines Einzelbandes heraushalten.
- Optional: weitere Sachgruppen freischalten, z. B. Geschichte (`900`) – Konfiguration ergänzen, Import laufen lassen.

## Oberfläche
- Screenreader: Zustand der Knöpfe am Schalter mitführen (`input.checked`), heute liest er immer „nicht aktiviert“.
- Farben der Knöpfe und Rahmen feinschleifen (Grundregeln stehen in CLAUDE.md „Gestaltungsregeln“).
- Testseite: Konsolenmeldungen 401/404 aufräumen (stören nicht, verwirren beim Prüfen).

## Konten und Abgleich zwischen Geräten (Überlegung 06.11.2026)
Konten für mich, Familie und Freunde (10–20 Personen) – machbar und kostenlos:
- Supabase Auth (Gratis bis 50.000 aktive Nutzer/Monat), Anmeldung per E-Mail-Link oder Passwort. Der eingebaute Mailversand schafft nur wenige Mails pro Stunde; sonst kostenloser Maildienst (z. B. Brevo, 300/Tag).
- Tabelle `user_books` mit Row Level Security (jeder sieht nur seine Einträge), ~3 MB für 20 Personen × 500 Bücher.
- Bringt den Abgleich Handy ↔ Laptop. Beim ersten Anmelden werden die IndexedDB-Daten hochgeladen; ohne Anmeldung bleibt alles wie heute.
- Später: gegenseitig sehen, wer ein Buch schon hat.
- Aufwand ca. 4–6 Stunden. Offen: Registrierung nur auf Einladung? Anmeldung per Link oder Passwort?

## Arbeitsweise
- **Auswertung der Prüfrunden ist fällig** (vereinbart nach ~5 Aufträgen): bisher etwa 6 Prüfaufträge seit 08.11.2026 – die Lernbuch-Regeln brauchten 3 Runden, alle späteren (Titelwörter, Amazon-Cover, größere Cover) bestanden in 1 Runde.

## Laufender Betrieb (nichts zu tun, nur zur Erinnerung)
- Monatlicher Katalog-Import am 1. (nächster: 01.12.2026), „Supabase wach halten“ alle 3 Tage.
- GitHub schaltet zeitgesteuerte Workflows nach 60 Tagen ohne Commit ab → nach der Warnmail im Actions-Tab wieder aktivieren.
- Datenbank: 311 MB von 500 MB (09.11.2026).
