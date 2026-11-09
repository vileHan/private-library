# Offene Punkte

Nur was noch zu tun ist. Erledigtes steht in der Git-Historie, Entscheidungen und Details in [CLAUDE.md](CLAUDE.md),
prüfbare Anforderungen in [ANFORDERUNGEN.md](ANFORDERUNGEN.md). Stand: 09.11.2026.

## Am iPhone ausprobieren (nur dort prüfbar)
- Knöpfe Besitze/Gelesen/Merken (neue Tipp-Logik, 3. Anlauf): lösen sie beim Scrollen, Wischen und beim Anhalten einer Scroll-Bewegung wirklich nicht mehr aus? Gehen normale Tipps nicht verloren? Haptik-Ticken beim Wischen ohne Wirkung ist möglich.
- Cover in der Liste antippen: Vollbild bleibt offen, der nächste Tipp schließt es, ohne darunter etwas auszulösen.

## Mit dem Import am 01.12.2026 (automatisch, schon im Code)
- Pappbilderbücher (~5.900) und Spielleiter-Schirme fallen weg.
- Känguru-Reihe mit vollen Titeln und Band 1–5; Box-Bände ohne Autor werden eingegliedert.

## Entscheidungen des Nutzers
- **„Mein Kinderbuchhaus“** (Oetinger-Sammelreihe, 8 Autoren) als Verlagsreihe herausnehmen? Sonst zeigt „Pippi Langstrumpf“ nach dem Import „Band 5“. Kleine Regel in `isPublisherSeries`.

## Katalog
- **Genre für alte Bücher**: 2000–2011 fehlt bei ~80 % der Gattungsbegriff. Lösung: (a) Open-Library-Schlagworte (englisch) über eine Zuordnungstabelle ins Deutsche (passt zum Workflow „Cover-IDs“), (b) grobe Ersatzgruppe aus der Sachgruppe (B = Belletristik, K = Kinder-/Jugendbuch) fürs Stöbern. Zuordnungstabelle danach gemeinsam durchgehen.
- **Sammelbände/Gesamtausgaben** (z. B. „4192 Seiten“) aus den Ausgaben eines Einzelbandes heraushalten.
- Optional: weitere Sachgruppen freischalten, z. B. Geschichte (`900`) – Konfiguration ergänzen, Import laufen lassen.

## Oberfläche
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
