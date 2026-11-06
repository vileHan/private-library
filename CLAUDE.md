# Private Library – Projektbeschreibung

Eine private Bücher-App (PWA) fürs Handy: Ich suche nach einem Buchtitel und sehe sofort, ob ich das Buch schon besitze und ob ich es gelesen habe.

Sprache der Oberfläche und der Daten: **Deutsch**.

> **Oberste Regel: Alles muss kostenlos sein.** Kein kostenpflichtiger Dienst, kein bezahlter Tarif, keine kostenpflichtigen Claude-Funktionen. Nur Gratis-Tarife, und deren Grenzen werden eingehalten. Wenn etwas nur bezahlt ginge, wird eine kostenlose Alternative gesucht.

Repository: https://github.com/vileHan/private-library (Branch `main`, **öffentlich**, weil GitHub Pages nur so kostenlos ist).
Live-App: **https://vilehan.github.io/private-library/**. GitHub Pages veröffentlicht automatisch jeden Push auf `main` aus dem Wurzelverzeichnis.
Commits laufen mit der GitHub-noreply-Adresse (in der lokalen Git-Konfiguration gesetzt). Keine privaten Daten oder Schlüssel ins Repository.

## Kernfunktion (Phase 1)

- Suchfeld nach Titel, Autor oder ISBN. Die Treffer kommen aus der **eigenen Katalog-Datenbank in Supabase** (ISBN-Suchen und Ausfälle: live von der DNB).
- Trefferliste: **Bücher in meinem Besitz ganz oben**, darunter der Rest. Innerhalb beider Blöcke **A–Z nach Titel** sortiert.
- Nicht besessene Bücher werden **ausgegraut** dargestellt.
- Jeder Eintrag zeigt **Cover, Titel, Autor**, dazu Genre, Jahr und Verlag, soweit vorhanden.
- Pro Buch: Häkchen **„besitze ich“** und **„gelesen“**. Die **Bewertung** (1–5 Sterne) ist vorbereitet, aber noch nicht zwingend.
- Ansicht **„Meine Bibliothek“**: alle eigenen Bücher, A–Z, durchsuchbar und sortierbar (Titel, Autor, Jahr).
- Seitenweises Laden (Pagination) statt alles auf einmal.

## Weitere Funktionen (umgesetzt)

- **Merkliste** („Merken“ ♡). Beim Markieren als „Besitze ich“ wird ein Buch automatisch von der Merkliste genommen.
- **Details** pro Buch: Bewertung 1–5 Sterne, Lesedatum (wird bei „Gelesen“ automatisch auf heute gesetzt), **Regale** (eigene Schlagworte), Notiz.
- **Meine Bücher**: Unteransichten *Liste* (Filter Besitze/Gelesen/Ungelesen/Merkliste/Alle + Regal, Sortierungen inkl. Bewertung und Lesedatum), *Reihen* (eigene Bände, „Alle Bände laden“ zeigt fehlende Bände von der DNB), *Statistik*.
- **Reihe** kommt aus 245 `$a`/`$p` oder aus 490/830/800, aber nur mit Bandnummer bis 3 Ziffern (so fallen Verlagsreihen mit Bestellnummer heraus).
- Bewusst **nicht** gewünscht: „Verliehen an“.
- **Buch-Slot (Variante B)**: Cover | Titel (max. 2 Zeilen), Autor, eine Infozeile (Reihe Band · Jahr · Genre kurz · ★ · ✎). Darunter eine feste Leiste „○ Besitze | □ Gelesen | ♡ Merken | ⋯“ – die Beschriftung bleibt bewusst, damit man die Symbole nicht vergisst. Alle Slots gleich hoch.
- **Detailblatt** („⋯“, von unten): Cover, voller Titel, Reihe/Jahr/Genre, die drei Knöpfe ausgeschrieben, **Ausgaben zum Ankreuzen**, Bewertung, Lesedatum, Regale, Notiz.
- **Cover-Raster** (Schalter oben rechts, pro Gerät gespeichert in `js/settings.js`): 2 Cover pro Reihe, keine Titel, Knöpfe nur als Symbole. **Symbole überall: Besitz ○/●, Gelesen □/■, Merken ♡/♥.** Gesten am Cover: einmal tippen = Titel einblenden, doppelt tippen = Detailblatt, **nach rechts wischen = besitze ich, nach links = merken** (jeweils mit „Rückgängig“).
- **Barcode-Scan** (`js/scan.js`): Knopf oben rechts neben dem Raster-Schalter. Der Suchknopf ist nur eine Lupe. Android/Chrome nutzt `BarcodeDetector`, sonst wird ZXing (`@zxing/browser@0.1.5` von jsDelivr) beim ersten Scan nachgeladen. Ergebnis = ISBN-Suche.
- **Suchvorschläge** ab 3 Buchstaben (350 ms Pause, 6 Treffer, DB-Funktion `suggest_works`: Titelanfang > alle Wörter im Titel > viele Ausgaben). Ressourcen geprüft: ~3 KB je Abfrage, Supabase Free = unbegrenzte Anfragen, 5 GB Datenverkehr im Monat.
- **Reihen in der Suche**: Passt die Suche zu einer Reihe, steht sie ganz oben in Bandfolge (in `search_works` und in der App `orderSeries`).
- **Vor Änderungen an Suchlogik/Datenbank** immer Ressourcen (500 MB, 3-s-Grenze, Datenverkehr) prüfen und bei größeren Änderungen vorher nachfragen.
- Schema-Änderungen ohne Datenimport: Workflow **„Datenbankschema“** (~1 Minute, darf parallel zu einem Import laufen). **Achtung:** Ein laufender Import spielt beim Schreiben das Schema aus seinem Startzeitpunkt ein. Wurde das Schema währenddessen geändert, danach „Datenbankschema“ noch einmal starten.

## Bewusst später

- Barcode-Scan mit der Handykamera
- Stöbern nach Autor und Genre zur Inspiration (wird durch die eigene Datenbank möglich)
- Abgleich der eigenen Markierungen zwischen mehreren Geräten (Supabase, gleiches Projekt)

## Datenquellen

| Quelle | Zweck | Zugang |
|---|---|---|
| **DNB SRU** `https://services.dnb.de/sru/dnb` | Hauptquelle: Titel, Autor, Verlag, Jahr, Seiten, ISBN, Sachgruppe, Gattungsbegriff | Frei, keine Anmeldung, CORS erlaubt, Lizenz CC0. `recordSchema=MARC21-xml` für alle Felder, `oai_dc` für einfache Felder. |
| **DNB-Cover** `https://portal.dnb.de/opac/mvb/cover?isbn=<ISBN>` | **Nicht verwenden** | Im Browser schaltet portal.dnb.de eine Bot-Prüfseite vor („Dein Browser wird geprüft!“). Die wird **nicht umgangen**. |
| **Open Library** `https://covers.openlibrary.org/b/id/<COVER-ID>-M.jpg` | Cover (erste Wahl, IDs aus der Datenbank) | Frei, **ohne Ratenbegrenzung**. Die Cover-IDs holt der Import aus dem Open-Library-Datenexport (`ol_dump_editions_latest.txt.gz`). |
| **Open Library per ISBN** `https://covers.openlibrary.org/b/isbn/<ISBN>-M.jpg?default=false` | Nur letzte Möglichkeit | **Max. 100 Abrufe pro 5 Minuten und IP.** Danach hängen die Anfragen (kein Fehler!). Deshalb gibt es pro Cover-Quelle eine Zeitgrenze (`covers.timeoutMs`). |
| **Google-Books-Cover** `https://books.google.com/books/content?vid=ISBN<ISBN>&printsec=frontcover&img=1&zoom=1` | Cover (zweite Wahl) | Frei, ohne Schlüssel. Fehlt das Cover, kommt ein PNG-Platzhalter („image not available“) mit **128×184 oder 128×170 px**. Er wird an der Größe erkannt und übersprungen. Kein CORS, deshalb kein Dateivergleich im Browser. Beim DB-Import serverseitig per Hash prüfen. |
| **Google Books API** `https://www.googleapis.com/books/v1/volumes?q=isbn:<ISBN>` | Optionale Ergänzung (Kategorien) | Nur mit eigenem kostenlosem API-Schlüssel. Ohne Schlüssel gibt es Fehler 429. |

## Katalogfilter (festgelegt)

Nur Treffer, die alle Bedingungen erfüllen:

- Sprache Deutsch: `spr=ger`
- Gedrucktes Buch: `mat=books` (E-Books sind bei der DNB `mat=online` und erscheinen **nicht als eigene Treffer**)
- Erscheinungsjahr **ab 2000**: `jhr>=2000`
- **Keine Hochschulschriften**: `not hss=*`
- Nur **Belletristik und Kinder-/Jugendbuch**: `(sgt=B or sgt=K)`. Weitere Bereiche sind vorerst nicht gewünscht. Sie sollen aber per Konfiguration (eine Liste von Sachgruppen) leicht ergänzbar sein.
- **Ohne Selfpublishing**: `not vlg="epubli" not vlg="Books on Demand" not vlg="tredition" not vlg="Neopubli"`

Ausnahme: **Suche per ISBN läuft immer ungefiltert**, damit ich auch Bücher außerhalb des Filters (Sachbuch, Selfpublishing, E-Book) in meine Bibliothek aufnehmen kann.

Größenordnung (Stand 11/2026): Die komplette Filterabfrage liefert **~735.000 Datensätze**. Das sind Ausgaben, keine Werke. Die Abfrage ist live getestet; „Unterleuten“ liefert 4 Treffer.

## Katalogregeln: nur „herkömmliche“ Bücher (js/classify.js)

Zusätzlich zum DNB-Filter fliegen beim Import (und in der DNB-Live-Suche) heraus, jeweils mit Begründung:

- **Sammelaufnahmen/Pakete**: MARC-Leader Position 19 = `a` oder Umfang „N Bände“.
- **Produktform** (653 „(Produktform)…“): Kalender, Spiel, Merchandise, Sticker-/Malbuch, Puzzle, Karten, Poster, Notizbuch, Box (Multiple-item) usw. Bindungsarten wie „Card cover“ oder „Hardback (stationery)“ sind normale Bücher. Merchandise-Kennzeichnung zählt nicht, wenn eine erzählende Gattung da ist.
- **Formschlagwort** (655, GND): Kinder-/Jugendsachbuch, Sachbilderbuch, Ratgeber, Bildband, Atlas, Wörterbuch, Spiel … – außer es gibt eine erzählende Gattung oder „Fiktionale Darstellung“.
- **Gattung** (`catalogFilter.excludeGenreGroups` in config.js): Spielerisches Lernen/Rätsel/Basteln, Geschenkbücher & Kalender, Kinder-Sachbücher – nur wenn **keine** erzählende Gattung dabei ist.
- **Titelwörter**: eindeutige immer (Malbuch, Wandkalender, VE 10, Übungsheft …), schwache nur ohne erzählende Gattung (Filmbuch, Begleitbuch, „alles über“, Lexikon …).
- **Zeitschriftenhefte** („Hot Topic!, 2024, 5“).
- **Titel = Reihenname** desselben Autors („Eragon“): eigentlicher Titel aus Untertitel bzw. Reihenangabe (`fixSeriesTitles` in works.js). Begleitbücher **ohne Autor**, die nur wie eine Reihe heißen, entfallen.
- **Umlaute**: Die DNB liefert sie oft zerlegt (u + ¨) → beim Einlesen per NFC zusammensetzen, sonst greifen Regeln mit Umlauten nicht.
- **Tests**: `tests/cases.js` (28 Fälle gegen echte DNB-Datensätze). Im Browser `http://localhost:8080/tests/index.html`, auf GitHub Workflow „Tests“ (läuft bei jedem Push). Neue Grenzfälle dort ergänzen.
- Stichprobe 11/2026: Die Regeln entfernen ~13 % der Ausgaben, bei 1.787 geprüften Ausgaben ohne erkennbaren Fehlgriff.

## Werke statt Ausgaben

Hardcover, Taschenbuch, Lizenzausgaben (z. B. Weltbild) und E-Book haben jeweils eine eigene ISBN, sollen aber **als ein Buch** zählen.

- Gruppierung zu einem **Werk** über normalisierten Autor + normalisierten **deutschen** Titel (Kleinschreibung, ohne Zusätze wie „: Roman“, ohne Satzzeichen und Artikel am Anfang) oder über eine gemeinsame ISBN.
- **Nicht** für die Gruppierung verwenden: Originaltitel (MARC 240) und „Erscheint auch als“ (776). Beide verbinden bei Reihen verschiedene Bände.
- **Box-Sets**: Die DNB legt pro enthaltenem Band einen Datensatz mit derselben Box-ISBN an. Eine ISBN, die bei verschiedenen Titeln vorkommt, verbindet nichts und wird dem Werk nicht zugeordnet.
- **Mehrbändige Titel**: MARC 245 `$a` = Reihe, `$n` = Band, `$p` = eigentlicher Titel. Angezeigt wird `$p`, die Reihe steht in der Infozeile („Eragon, Band 2“).
- „Besitze ich“ gilt für das Werk. Zusätzlich wird gespeichert, **welche Ausgaben** ich habe (`ownedIsbns`, mehrere möglich).
- Testfall Eragon: „Der Auftrag des Ältesten“ soll ~8 Ausgaben haben, nicht 26+.
- Bekannter Grenzfall: Comic-Adaptionen oder Hörbuch-Fassungen eines Romans. Diese sollen getrennt bleiben, z. B. über die Sachgruppe 741.5 (Comics).
- Beispiel zum Testen: „Der Augenjäger“ (Fitzek) hat bei der DNB 30 Datensätze inkl. Übersetzungen, Weltbild-Ausgabe, E-Book und Comic.

## Genres

- Erste Quelle: der **DNB-Gattungsbegriff**, MARC-Feld `655` mit `$2 gatbeg`, z. B. „Krimis, Thriller, Spionage“. Er ist bereits deutsch (Warengruppen des Buchhandels).
- Fallback: Schlagworte aus Open Library oder Google Books (englisch). Diese werden über eine **Zuordnungstabelle** (`genres-mapping`) ins Deutsche übertragen.
- Genres werden **nie manuell pro Buch** gepflegt. Die Zuordnungstabelle prüfen wir später einmal gemeinsam.

## Architektur: eigene Katalog-Datenbank (Supabase)

Ziel: Die Daten werden **einmal aufbereitet** und nicht bei jeder Suche neu.

- **Supabase, Gratis-Tarif**: Projekt `vdkobcydrflzamrqrwtu` (Frankfurt), Postgres mit **500 MB**. Die App nutzt nur den öffentlichen Publishable-Key (in `js/config.js`) und kann ausschließlich lesen (Row Level Security; Schreibversuch getestet → abgelehnt).
- **Zugang für den Import**: GitHub-Secret `SUPABASE_DB_URL` mit der **Session-pooler**-Adresse (`postgres.<projekt>@aws-1-eu-central-1.pooler.supabase.com:5432`). Die direkte Verbindung geht von GitHub aus nicht (nur IPv6). Passwort nie in Code, Chat oder Repository.
- **Schema** `supabase/schema.sql` (Version 2, idempotent, läuft bei jedem Import):
  - **Eine Tabelle `works`**. Ausgaben stehen nur als `isbns bigint[]` darin. Details (Verlag, Bindung, Jahr) lädt die App beim Antippen von „N Ausgaben“ live von der DNB (`editionsByIsbns`).
  - **Volltextindex** (`to_tsvector('simple', search_title || ' ' || search_author)`) für die Suche nach Wortanfängen. **Kein Trigramm-Index**: der war ~4× größer und hätte die 500 MB gesprengt.
  - Tippfehler: `search_works` sucht nur bei **0 Treffern** per `word_similarity` (ohne Index).
  - **Stand nach dem Import mit Katalogregeln (06.11.2026): 400.279 Werke (58.226 Nicht-Bücher entfernt), Datenbank 284 MB** von 500 MB (inkl. Platz aus Aktualisierungen, den Postgres wiederverwendet). 51.813 Werke haben eine Open-Library-Cover-ID (~11 %), der Rest läuft über Google. Der Import dauert ~3,5 h (DNB ~1,5 h, Open-Library-Export ~2 h).
  - **Supabase bricht öffentliche Anfragen nach 3 s ab.** Deshalb ignoriert `search_works` Füllwörter (der, die, und …), deckelt die Treffermenge bei 3.000 und sucht Tippfehler nur unter Werken mit gleichen Wortanfängen (Index). Alle Testsuchen liegen bei 0,1–0,3 s.
  - Schema ändern ohne Daten neu zu laden: Import-Workflow mit „Nur das Datenbankschema aktualisieren“.
- **Werke ohne ISBN** werden nicht importiert (~13 %: Buchclub-Ausgaben, Heftromane, Selbstverlage, Merchandise, Katalog-Sammeleinträge).
- **Cover**: nur Open-Library-Cover-IDs speichern, keine Bilder. Reihenfolge in der App (`coverUrls` in card.js): eigene Ausgabe per Google → Open-Library-Cover-ID → weitere ISBNs per Google → Open Library per ISBN → Platzhalter.
- **Import-Workflow** `.github/workflows/import.yml`: manuell (Jahre/Sachgruppen wählbar, Probelauf, „Katalog leeren“) und monatlich am 1. Die DNB wird nach Jahr × Sachgruppe aufgeteilt (Blättergrenze 100.000), 3 Anfragen parallel. Nur geänderte Zeilen werden geschrieben, damit die Datenbank nicht aufbläht.
- **Verbindungstest/Größen**: Workflow „Supabase wach halten“ (`scripts/ping.mjs`) zeigt Benutzer/Host (nie das Passwort) und die Tabellengrößen. Er läuft alle 3 Tage, damit Supabase nicht pausiert.
- **Achtung GitHub**: Zeitgesteuerte Workflows in öffentlichen Repos werden nach 60 Tagen ohne Commit deaktiviert. GitHub schickt vorher eine Mail, dann im Actions-Tab wieder aktivieren.
- **Datenquelle austauschbar**: `js/catalog.js` nutzt Supabase, wenn `CONFIG.supabase` gesetzt ist, sonst die DNB live. ISBN-Suchen laufen immer über die DNB (ungefiltert). Bei Datenbankfehlern greift automatisch die DNB.
- **Testhinweis Browser-Ansicht:** Lazy-Bilder laden in Hintergrund-Tabs nicht. Vor Cover-Tests den Tab nach vorne holen.
- Die eigenen Markierungen liegen weiterhin lokal in IndexedDB. Später optional Abgleich über Supabase mit Anmeldung.

## Technik

- **PWA mit reinem HTML, CSS und JavaScript**, ohne Build-Schritt und ohne Frameworks, die einen Build brauchen. Auf dem Rechner sind **weder Node.js noch Python installiert**.
- Eigene Daten (Besitz, gelesen, Bewertung, Ausgabe) liegen lokal in **IndexedDB**. Export und Import als JSON-Datei dienen als Backup.
- Hosting kostenlos auf **GitHub Pages** (oder Cloudflare Pages). Auf dem Handy wird die App über „Zum Startbildschirm hinzufügen“ installiert.
- Service Worker für die Offline-Nutzung von „Meine Bibliothek“. Die Live-Suche braucht Internet.
- Lokal testen: `tools/serve.ps1` (kleiner PowerShell-Webserver, Port 8080). In `.claude/launch.json` ist er als `bibliothek` eingetragen. ES-Module brauchen einen Server, `file://` funktioniert nicht.
- Icons erzeugt `tools/make-icons.ps1` (System.Drawing).
- Neue oder umbenannte Dateien auch in die `SHELL`-Liste in `sw.js` eintragen und `CACHE` hochzählen.

## Code-Überblick

- `js/config.js`: Filter, Cover-Quellen, Seitengröße
- `js/dnb.js`: CQL-Abfrage bauen, SRU abrufen, MARC21 auswerten (Hörbücher und E-Books fallen außer bei der ISBN-Suche heraus)
- `js/classify.js`: Katalogregeln (siehe oben)
- `js/works.js`: Ausgaben zu Werken gruppieren (Werkschlüssel + gemeinsame ISBN, Reihentitel-Korrektur), Sortierung ohne führenden Artikel (DNB-Marker `\u0098…\u009C`)
- `js/catalog.js`: austauschbare Katalog-Schnittstelle (heute DNB, später Supabase)
- `js/store.js`: IndexedDB, Export/Import
- `js/library.js`: eigene Bibliothek im Speicher, `entryFor`, `updateEntry` (leere Einträge werden gelöscht)
- `js/card.js`: Buchkarte inkl. Ausgaben-Häkchen und Detailbereich
- `js/series.js`, `js/stats.js`: Reihen- und Statistik-Ansicht
- `js/util.js`: kleine Helfer
- `js/scan.js`: Barcode-Scanner, `js/settings.js`: Geräte-Einstellungen (Raster/Liste)
- `js/app.js`: Suche, Meine Bücher, Tabs, Sicherung
- Mobil zuerst (Handy-Breite), muss aber auch am PC gut nutzbar sein.
