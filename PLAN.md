# Offene Punkte

Nur was noch zu tun ist. Erledigtes steht in der Git-Historie, Entscheidungen und Details in [CLAUDE.md](CLAUDE.md),
prüfbare Anforderungen in [ANFORDERUNGEN.md](ANFORDERUNGEN.md). Stand: 09.11.2026.

## Neueste 20 Änderungen zum Ausprobieren (Stand 12.11.2026) – zu Beginn der nächsten Sitzung zuerst zeigen
Vorher die App ganz schließen und neu öffnen (ggf. zweimal), damit Version v65 ankommt.

**Geschenk**
1. **Kurzlink** (Link aus dem Chat) öffnen, am besten im privaten Safari-Tab: App startet in der Geschenkfarbe, Name in der Kopfleiste.
2. **Gruß schlank:** nur Torte, Gruß, Text und „Los geht’s 📚“ – keine Infotexte mehr.
3. **„Los geht’s“** → Konfetti-Explosion über der Bibliothek + leise Melodie (Stumm-Schalter aus!).
4. **🎂 oben** spielt den Gruß mit Melodie erneut ab.
5. **Karte** (Link aus dem Chat): drucken (A4 quer, falten), QR-Code scannen → landet beim Kurzlink.

**App-Gefühl (Paket 1)**
6. **Reiter unten** (Suche · Meine Bücher · Zufall · Einstellungen): liegt über dem Home-Balken, gut mit dem Daumen zu treffen? Zahl der eigenen Bücher als Abzeichen.
7. **Einstellungen** als eigener Reiter (Darstellung, Daten sichern) – „Meine Bücher“ zeigt nur noch Bücher.
8. **Laden:** neue Suche zeigt schimmernde Platzhalter-Karten (im Raster in Cover-Form); beim Weitertippen werden alte Treffer nur abgeblendet statt zu flackern.
9. **Cover** blenden weich ein.
10. **Leere Seiten** mit Symbol, Überschrift und Knopf: Suche „xqzvw“ („Barcode scannen ›“), leere Reihen/Statistik/Regal, „Noch keine Bücher“ („Bücher suchen ›“).
11. **Detailblatt:** Cover als Hintergrund oben (jetzt weniger verschwommen) – gefällt es bei hellen und dunklen Covern? Angaben gut lesbar?

**Bedienung (Paket 3)**
12. **Knöpfe rasten ein:** Besitze/Gelesen/Merken drücken sich kurz ein, Symbol springt – Stärke/Tempo okay?
13. **Kein „Rückgängig“ mehr in der Liste** (im Raster nach Gesten weiterhin „↶ Rückgängig“).
14. **Weiche Übergänge:** Autor/Genre/Reihe im Detailblatt antippen → Seite schiebt sich von rechts herein; zurück von links.
15. **Reiter- und Unteransichtswechsel** (Liste/Reihen/Regale/Statistik) blenden kurz ein.
16. **Zurück per Wischen vom linken Rand** (installierte App): auf einer Autoren-/Reihenseite ganz links ansetzen und nach rechts ziehen – Seite folgt, „‹“-Kreis färbt sich, zurück zur Suche. Stört es beim normalen Scrollen?
17. **Regal:** Regal öffnen → vom Rand wischen → Regal-Übersicht.
18. **In Safari** (nicht installiert): die Safari-eigene Randgeste führt ebenso eine Ebene zurück.
19. **Zweimal schnell „‹“** → bleibt in der App (vorher flog man raus).
20. **Android (falls zur Hand):** Zurück-Taste auf Autorenseite → Suche; bei offenem Detailblatt schließt sie nur das Blatt.

**Offen zur Entscheidung:** Soll ein abgewähltes Buch im Filter „Besitze“ sofort verschwinden (heute bleibt es bis zum nächsten Öffnen stehen)? · Dungeon Crawler Carl Band 1 kommt mit dem Import am 01.12.2026 · „Meine Bücher“ weiter aufräumen (Varianten zeigen).

## Am iPhone testen (ältere Liste, Stand 10.11.2026)
Vorher die App einmal schließen und neu öffnen, damit die neue Version ankommt (ggf. zweimal).
1. **Wischen ab den Knöpfen:** schnell hintereinander durch die Trefferliste wischen und dabei auf Besitze/Gelesen/Merken ansetzen – scrollt die Liste, löst nichts aus? Normaler Tipp löst genau einmal aus, Haptik in der Knopfmitte.
2. **Cover-Vollbild:** Cover in der Liste antippen → groß; danach weiterwischen → Bild weg und Liste scrollt in derselben Bewegung.
3. **Suchleiste:** „×“ leert alles; Tippen/Scrollen außerhalb schließt die Tastatur; der erste Tipp auf einen Knopf bei offener Tastatur kommt an.
4. **Detailblatt:** „Reihe: …, Band 2 ›“ zeigt die ganze Reihe; „Bei Amazon ansehen“ öffnet und man kommt gut zurück; „ד oben rechts schließt nur das Blatt (auch wenn darunter „Merken“ liegt); Kästchen „Abgebrochen“ gut zu treffen.
5. **Meine Bücher:** wirkt es jetzt luftig? Filterzeile wischen (Verlauf rechts verschwindet am Ende); Unteransicht **Regale**: anlegen, öffnen, umbenennen, löschen; Eingabefenster („Name des Regals“) fühlt sich in der installierten App okay an?
6. **Würfel-Reiter 🎲:** Ungelesen/Gemerkt/Regale ▾ (mehrere Häkchen), Aufklappliste schließt beim Tippen daneben, Würfeln.
7. **Statistik:** Jahresziel festlegen; nach kurzer Zeit erscheinen Seitenzahlen.
8. **Sicherung:** Exportieren → Datei in „Dateien“ speichern; testweise auf einem zweiten Gerät (iPad) importieren.
9. **Darstellung:** Meine Bücher → „Darstellung“: Papier & Tinte ↔ Klassisch, Farben durchprobieren (hell und dunkel); welche Farbe passt zur Beschenkten?
10. **Geschenk-Link** (aus dem Chat, nicht im Repository): in Safari öffnen → Gruß; dann „Zum Home-Bildschirm“ → App öffnen: Name und Gruß auch dort (einmal)? Karte drucken, falten, QR-Code scannen.

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
- Zeitungs-/Verlagseditionen sind keine Reihe mehr: „Bild am Sonntag – Mega Thriller!“, „Welt am Sonntag“, „Schönen Sonntag“, „Sonntagsblatt“, „SonntagsBlick“, „Allgemeine“ (Noah, Der Erlöser, Ausgelöscht …); ebenso „Fitzek-Box“ (Amokspiel, Das Kind …).
- Fehlender Band 1 in Reihen (~219 Reihen), z. B. Dungeon Crawler Carl: heute in der Datenbank noch „Entertainment ist Pflicht - Überleben nicht : Roman“ ohne Band – der Code liefert schon „Entertainment ist Pflicht - Überleben nicht“, Band 1 (geprüft 12.11.2026). Eigene Einträge ziehen danach innerhalb von 12 h nach.

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
- **„Meine Bücher“ weiter aufräumen** (Wunsch des Nutzers 12.11.2026): Seite wirkt noch voll – Suchfeld, Sortierung, Filter-Chips und Unteransichten übersichtlicher anordnen (z. B. Filter/Sortierung hinter einem Knopf, Suchfeld einklappbar). Vorher Varianten zeigen.
- Screenreader: Zustand der Knöpfe am Schalter mitführen (`input.checked`), heute liest er immer „nicht aktiviert“.
- Farben der Knöpfe und Rahmen feinschleifen (Grundregeln stehen in CLAUDE.md „Gestaltungsregeln“).
- Testseite: Konsolenmeldungen 401/404 aufräumen (stören nicht, verwirren beim Prüfen).

## Konten erstellen (Wunsch des Nutzers 10.11.2026)
- **Start zum Testen: 5 Konten** (Nutzer + 4 Testpersonen), später ausbaubar auf Familie und Freunde (10–20).
- Kostenlos über Supabase Auth (Gratis-Tarif, bis 50.000 aktive Nutzer/Monat). Anmeldung per E-Mail + Passwort oder E-Mail-Link; die 5 Konten legt der Nutzer im Supabase-Dashboard an oder per Einladung (keine offene Registrierung). Eingebauter Mailversand reicht für 5 Personen.
- Tabelle `user_books` mit Row Level Security: jede Person sieht nur ihre eigenen Einträge (~1 MB für 5 × 500 Bücher, Grenze 500 MB).
- Angemeldet: Markierungen liegen in Supabase und sind auf allen Geräten gleich (Handy, iPad, Laptop). Beim ersten Anmelden werden die vorhandenen Daten des Geräts hochgeladen. Ohne Anmeldung bleibt alles wie heute (nur auf dem Gerät).
- Später möglich: sehen, wer ein Buch schon hat / ausleihen kann.
- Aufwand ca. 4–6 Stunden (Stufe 3). Offen: Anmeldung per Passwort oder Link?

## Arbeitsweise
- **Auswertung der Prüfrunden ist fällig** (vereinbart nach ~5 Aufträgen): bisher etwa 6 Prüfaufträge seit 08.11.2026 – die Lernbuch-Regeln brauchten 3 Runden, alle späteren (Titelwörter, Amazon-Cover, größere Cover) bestanden in 1 Runde.

## Laufender Betrieb (nichts zu tun, nur zur Erinnerung)
- Monatlicher Katalog-Import am 1. (nächster: 01.12.2026), „Supabase wach halten“ alle 3 Tage.
- GitHub schaltet zeitgesteuerte Workflows nach 60 Tagen ohne Commit ab → nach der Warnmail im Actions-Tab wieder aktivieren.
- Datenbank: 311 MB von 500 MB (09.11.2026).
