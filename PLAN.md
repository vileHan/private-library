# Offene Punkte

Nur was noch zu tun ist. Erledigtes steht in der Git-Historie, Entscheidungen und Details in [CLAUDE.md](CLAUDE.md),
prüfbare Anforderungen in [ANFORDERUNGEN.md](ANFORDERUNGEN.md). Aufgeräumt am 13.11.2026 (Nutzer: „alles außer Konten raus“).

## Konten erstellen (Wunsch des Nutzers 10.11.2026)
- **Start zum Testen: 5 Konten** (Nutzer + 4 Testpersonen), später ausbaubar auf Familie und Freunde (10–20).
- Kostenlos über Supabase Auth (Gratis-Tarif, bis 50.000 aktive Nutzer/Monat). Anmeldung per E-Mail + Passwort oder E-Mail-Link; die 5 Konten legt der Nutzer im Supabase-Dashboard an oder per Einladung (keine offene Registrierung). Eingebauter Mailversand reicht für 5 Personen.
- Tabelle `user_books` mit Row Level Security: jede Person sieht nur ihre eigenen Einträge (~1 MB für 5 × 500 Bücher, Grenze 500 MB).
- Angemeldet: Markierungen liegen in Supabase und sind auf allen Geräten gleich (Handy, iPad, Laptop). Beim ersten Anmelden werden die vorhandenen Daten des Geräts hochgeladen. Ohne Anmeldung bleibt alles wie heute (nur auf dem Gerät).
- Später möglich: sehen, wer ein Buch schon hat / ausleihen kann.
- Aufwand ca. 4–6 Stunden (Stufe 3). Offen: Anmeldung per Passwort oder Link?

---

## Zur Info (keine Aufgaben)

### Was der Import am 01.12.2026 mitbringt (schon im Code)
- Pappbilderbücher (~5.900) und Spielleiter-Schirme fallen weg.
- Känguru-Reihe mit vollen Titeln und Band 1–5; Box-Bände ohne Autor werden eingegliedert.
- Zeitungs-/Verlagseditionen sind keine Reihe mehr: „Bild am Sonntag – Mega Thriller!“, „Welt am Sonntag“, „Schönen Sonntag“, „Sonntagsblatt“, „SonntagsBlick“, „Allgemeine“ (Noah, Der Erlöser, Ausgelöscht …); ebenso „Fitzek-Box“ (Amokspiel, Das Kind …).
- „Die drei ??? Kids“: zerlegte Fragezeichen repariert, Reihenname vorne im Titel auch mit Komma abgeschnitten („Mission Graffiti-Code“); Sammelausgaben („Die Zwerge – Die komplette Saga 1“) eigene Werke statt Ausgabe von Band 1.
- Ersatz-Genres für Bücher ohne Gattungsbegriff (Reihe, Autor, Schlagworte/Untertitel, Sachgruppe). Stichprobe 13.11.2026: 0 % ohne Genre; grob („Romane, Erzählungen“/„Kinder- und Jugendbücher“ nur aus der Sachgruppe) ≈ 10–12 % des Katalogs, fast alles 2000–2011.
- Fehlender Band 1 in Reihen (~219 Reihen), z. B. Dungeon Crawler Carl: heute in der Datenbank noch „Entertainment ist Pflicht - Überleben nicht : Roman“ ohne Band – der Code liefert schon „Entertainment ist Pflicht - Überleben nicht“, Band 1 (geprüft 12.11.2026). Eigene Einträge ziehen danach innerhalb von 12 h nach.

### Laufender Betrieb
- Monatlicher Katalog-Import am 1. (nächster: 01.12.2026, ~3,5 h ab 03:00 Uhr), „Supabase wach halten“ alle 3 Tage.
- GitHub schaltet zeitgesteuerte Workflows nach 60 Tagen ohne Commit ab – seit 13.11.2026 automatisch verhindert: „Supabase wach halten“ legt nach 45 Tagen ohne Commit einen leeren Commit an. Falls doch eine Warnmail kommt: im Actions-Tab wieder aktivieren.
- Datenbank: 311 MB von 500 MB (09.11.2026).
