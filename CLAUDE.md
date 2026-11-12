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
- **Nichts wird ausgegraut** (verworfen, wirkte wie „nicht verfügbar“). Keine Abzeichen am Cover (✓/♥ ausprobiert und wieder entfernt) – der Status steht in den Knöpfen ○ □ ♡. Knopfleiste in der Liste flach (~35 px).
- Jeder Eintrag zeigt **Cover, Titel, Autor**, dazu Genre, Jahr und Verlag, soweit vorhanden.
- Pro Buch: Häkchen **„besitze ich“** und **„gelesen“**. Die **Bewertung** (1–5 Sterne) ist vorbereitet, aber noch nicht zwingend.
- Ansicht **„Meine Bibliothek“**: alle eigenen Bücher, A–Z, durchsuchbar und sortierbar (Titel, Autor, Jahr).
- Seitenweises Laden (Pagination) statt alles auf einmal.

## Weitere Funktionen (umgesetzt)

- **Merkliste** („Merken“ ♡). Beim Markieren als „Besitze ich“ wird ein Buch automatisch von der Merkliste genommen.
- **Meine Bücher, Ausbau 09.11.2026** (ANFORDERUNGEN D8–D10): Status **„Abgebrochen“** (Detailblatt, Feld `abandoned`; Gelesen/Lesedatum heben es auf), Filter-Chips in einer **wischbaren Zeile** (Ausblend-Verlauf, aktiver Chip ins Bild). **Variante B (10.11.2026):** Unteransichten **Liste · Reihen · Regale · Statistik**; „Regale“ (`js/shelves.js`): Übersicht mit Anzahl und Cover-Streifen, „+ Neues Regal“, Regal öffnen, Umbenennen (Rückfrage beim Zusammenlegen), Löschen (Bücher bleiben); leere Regale pro Gerät in settings `shelves`. **Reiter „Zufall“** (Würfel, unten; `js/random.js`): Ungelesen/Gemerkt als Umschalter, „Regale ▾“ mit Häkchen (mehrere), Erklärung im leeren Ergebnisfeld, Auswahl in settings `random`; **Statistik** mit Jahresziel (settings `readingGoals`), Gelesen pro Monat, Seiten pro Jahr, Genres gelesen, Lieblingsautoren, dickstes/dünnstes Buch. Seitenzahlen lädt die Statistik für gelesene Bücher im Hintergrund von der DNB nach (`fillPages`, max. 10 je Öffnen). Leere Regale und Jahresziele sind seit 10.11.2026 in der JSON-Sicherung (Feld `settings`).
- **Details** pro Buch: Bewertung 1–5 Sterne, Lesedatum (wird bei „Gelesen“ automatisch auf heute gesetzt), **Regale** (eigene Schlagworte), Notiz.
- **Meine Bücher**: Unteransichten *Liste* (Filter Besitze/Gelesen/Ungelesen/Merkliste/Alle + Regal, Sortierungen inkl. Bewertung und Lesedatum), *Reihen* (eigene Bände, „Alle Bände laden“ zeigt fehlende Bände von der DNB), *Statistik*.
- **Reihe** kommt aus 245 `$a`/`$p` oder aus 490/830/800, aber nur mit Bandnummer bis 3 Ziffern (so fallen Verlagsreihen mit Bestellnummer heraus).
- Bewusst **nicht** gewünscht: „Verliehen an“.
- **Buch-Slot**: großes Cover links (80×120, auf 360-px-Handys 72×108); rechts Titel (max. 2 Zeilen), Autor, eine Infozeile („Band 2“ · Jahr · Genre kurz · ★ · ✎; Reihenname nur im Detailblatt bzw. ohne Bandnummer) und darunter **kompakte Pillen „○ Besitze · □ Gelesen · ♡ Merken“** – die Beschriftung bleibt bewusst. **„⋯“ sitzt oben rechts in der Karte.** Alle Slots gleich hoch (~145 px).
- **Detailblatt** („⋯“, von unten): **lässt sich nach unten wegziehen** (am Griff immer, im Inhalt nur ganz oben; > 30 % oder schnelles Schnippen schließt, sonst federt es zurück). Knöpfe lösen **nur bei einem echten Tipp** aus (`onTap` in util.js: ≤ 10 px, < 600 ms, kein Abbruch, keine Scroll-Bewegung kurz vor oder während der Berührung; Maus/Tastatur per click). `switchToggle` bzw. `wireToggle` (für die Knöpfe aus der Karten-Vorlage in index.html – ohne ihn reagieren sie gar nicht) meldet dafür ein eigenes Ereignis `toggle`; der native Schalter deckt nur die Mitte des Knopfs ab (inset 30 %) und ist abgeschaltet, solange die Seite scrollt (Klasse `scrolling` an <html>, 350 ms Nachlauf) – so bleibt auch schnelles Weiterwischen ab einem Knopf nicht hängen; Knöpfe sind `<span>`, kein `<label>`; das `change` des iOS-Schalters zählt nicht (iOS legt ihn auch beim Wischen um – zwei Fassungen, die change filterten, halfen am iPhone nicht, 09.11.2026).
   Cover, voller Titel, Reihe/Jahr/Genre, die drei Knöpfe ausgeschrieben, dann **Klappentext** (5 Zeilen, „Mehr lesen“; fehlt er, entfällt der Abschnitt), dann **Bewertung, Lesedatum, Regale, Notiz** und ganz unten **zugeklappt die Ausgaben zum Ankreuzen** (Details werden erst beim Aufklappen von der DNB geladen).
- **Cover-Vollbild** (09.11.2026): In der Liste und im Detailblatt öffnet ein **echter Tipp** aufs Cover ein Vollbild (`openCoverZoom`, große Fassung über `hiResCover`: Amazon `_SY900_`, Open Library `-L`). **Jede nächste Aktion schließt es** (Berührung, Mausrad, Taste); die Fläche bleibt unsichtbar bis kurz nach dem Loslassen liegen, damit nichts darunter auslöst; Geisterklick in den ersten 500 ms wird geschluckt. Im Raster bleibt der Tipp „Titel einblenden“. Eine Ansicht „Groß“ (1 Cover je Reihe) war kurz drin und ist auf Wunsch wieder raus; Zwei-Finger-Geste bewusst nicht.
- **Cover-Raster** (Schalter oben rechts, pro Gerät gespeichert in `js/settings.js`): 2 Cover pro Reihe, keine Titel, Knöpfe nur als Symbole, dünner heller Rahmen um Cover + Knöpfe. **Symbole überall: Besitz ○/●, Gelesen □/■, Merken ♡/♥.** Gesten am Cover: **einmal tippen = Titel einblenden (mit Knopf „Details ›“), doppelt tippen = Besitze ich, nach rechts wischen = Merken (goldener Rahmen), nach links wischen = Gelesen (grüner Rahmen), gedrückt halten (0,5 s) = Detailblatt**. Danach erscheint 2,5 s lang nur ein Knopf „↶ Rückgängig“.
- **Haptik**: Android vibriert per Vibration-API (`haptic()` in util.js) bei Knöpfen, Doppeltipp, Wischen, Halten und Scan. **iPhone**: Safari kennt keine Vibration; der Umweg „Schalter per Programm umlegen“ wirkt auf iOS 27 nicht mehr (entfernt). **Bestätigt auf iOS 27 (06.11.2026):** Die Knöpfe Besitze/Gelesen/Merken sind `<label>` mit einem echten, fast unsichtbaren `<input type="checkbox" switch>` darüber (`switchToggle()`), den der Finger selbst umlegt; die App reagiert auf dessen `change`. Gesten haben am iPhone nur **sichtbares Feedback**: Cover drückt sich beim Halten ein, hüpft bei Doppeltipp/Wischen. Muster für weitere Knöpfe mit Haptik: `switchToggle()` verwenden und auf `change` reagieren.
- **Zoom gesperrt**: `touch-action: manipulation` überall (auch auf den Raster-Covern – `pan-y` dort hatte Safaris Doppeltipp-Zoom wieder erlaubt), Viewport `maximum-scale=1, user-scalable=no`, zweiter Tipp eines Doppeltipps auf Covern per `touchend.preventDefault()` verschluckt. Eingabefelder mindestens 16 px (sonst zoomt das iPhone beim Antippen). Zwei-Finger-Zoom lässt iOS aus Barrierefreiheitsgründen trotzdem zu.
- **Suchleiste** (09.11.2026): keine Lupe mehr (Tastatur-„Suchen“ und Live-Suche reichen), eigenes „×“ leert alles; Berührung außerhalb der Leiste schließt die Tastatur (danach 400 ms Scroll-Ereignisse ignorieren, damit der Tipp ankommt).
- **Barcode-Scan** (`js/scan.js`): Knopf oben rechts neben dem Raster-Schalter. iPhone hat keinen BarcodeDetector → ZXing `BrowserMultiFormatOneDReader` (nur Strichcodes, „Try harder“) liest per `decodeFromVideoElement` aus dem laufenden Video; Kamera mit 1920×1080 und Dauer-Autofokus. Erster Ansatz (alle Formate, `decodeFromStream`, niedrige Auflösung) erkannte am iPhone nichts; **mit dem neuen Aufbau am iPhone bestätigt (06.11.2026).** Statuszeile zeigt die Erkennung. (Knopf „ISBN eintippen“ ausprobiert und auf Wunsch wieder entfernt.) Android/Chrome nutzt `BarcodeDetector`, sonst wird ZXing (`@zxing/browser@0.1.5` von jsDelivr) beim ersten Scan nachgeladen. Ergebnis = ISBN-Suche.
- **Live-Suche**: Treffer erscheinen beim Tippen (ab 3 Buchstaben, 500 ms Pause, keine Aufklapp-Liste mehr). Ressourcen geprüft: ~20 KB je Trefferseite, ≈ 120 MB im Monat bei viel Nutzung, Supabase Free = unbegrenzte Anfragen, 5 GB Datenverkehr. (`suggest_works` existiert noch in der DB, wird aber nicht mehr genutzt.)
- **Stöbern** (11/2026): Ohne Suche zeigt der Such-Tab 15 **Genre-Knöpfe** (DNB-Gattungen zusammengefasst, `js/genres.js` = SQL `genre_group()`, beide gleich halten; Index `works_genre_pop3_idx` ~16 MB). Genre = beliebteste zuerst, 50 je Seite (`browse_genre`, **security definer** – mit Row Level Security griff der Index sonst nicht, > 3 s). Im Detailblatt sind **Autor** („Name ›“ → Autorenseite, `author_works`, A–Z, eigene oben, Reihen zusammen), **Reihe** („Eragon, Band 2 ›“ → alle Bände in Bandfolge, alle Autoren, `series_works`, 30–140 ms auch bei 186 Bänden; 09.11.2026) und Genre („Mehr Fantasy ›“) antippbar. Leiste „‹ Autor/Genre“, Zurück stellt die vorherige Suche wieder her. Gemessen: Genres 40–250 ms, Autoren 80–430 ms.
- **Beliebtheit** (`popularity()` in schema.sql): Ausgaben ×2 + Bestseller-Kennzeichen der DNB (+20, Import) + ln(1 + Open-Library-Leselisten-Einträge) ×6 (Workflow „Cover-IDs“, Spalte `ol_readers`).
- **Sortierung der Suche**: 1. passende Reihe (Eingabe ist der Reihenname oder deckt ihn als ganze Wörter mindestens zur Hälfte ab; Reihen nach Bekanntheit, Bände in Folge), 2. ganze Wörter vor Wortanfängen, 3. Bekanntheit, 4. A–Z. Titel- und Autortreffer zählen gleich. Höchstens 1.000 Kandidaten (wegen der 3-s-Grenze). Testsuchen: harry, eragon, zeh, kind, liebe, fitzek, drache, unterleutn – alle unter 0,3 s.
- **Reihen in der Suche**: Passt die Suche zu einer Reihe, steht sie ganz oben in Bandfolge (in `search_works` und in der App `orderSeries`).
- **Vor Änderungen an Suchlogik/Datenbank** immer Ressourcen (500 MB, 3-s-Grenze, Datenverkehr) prüfen und bei größeren Änderungen vorher nachfragen.
- Schema-Änderungen ohne Datenimport: Workflow **„Datenbankschema“** (~1 Minute, darf parallel zu einem Import laufen). **Achtung:** Ein laufender Import spielt beim Schreiben das Schema aus seinem Startzeitpunkt ein. Wurde das Schema währenddessen geändert, danach „Datenbankschema“ noch einmal starten.

## Arbeitsweise: bauen → prüfen → verbessern (seit 08.11.2026)

- **ANFORDERUNGEN.md** = prüfbare Abnahmekriterien (IDs A1 …). Neue Wünsche des Nutzers dort unter „Eingang“ sammeln und in prüfbare Punkte umformulieren.
- **Prüfer-Agent** (`.claude/agents/pruefer.md`, Agent-Typ `pruefer`): übernimmt die Rolle des Nutzers, ändert nichts, prüft gegen ANFORDERUNGEN.md (Tests, Browser in 375/360 px, Messungen, Stichproben) und liefert VERDIKT + Mängelliste. Bei BESTANDEN setzt er den Prüf-Stempel.
- **Prüfstufen** (der Prüfer-Agent kostet viele Tokens – Wunsch des Nutzers 08.11.2026, Stufe nach der Änderung wählen und im Bericht nennen):
  - **Stufe 0 – kein Prüfen:** reine Fragen, Doku/Kommentare, Texte in ANFORDERUNGEN/PLAN, Memory. (Zählt nicht für den Stempel.)
  - **Stufe 1 – Selbstprüfung (ohne Agent):** kleine, von Tests abgedeckte Änderungen – Textänderung in der Oberfläche, einzelne CSS-Regel, neue Testfälle, Rücknahme auf einen geprüften Stand, Versionsnummer in sw.js. Claude lässt `tests/index.html` und `tests/ui.html` selbst laufen (ggf. kurzer Blick in 360 px) und setzt bei grün den Stempel selbst (`tools/pruefstempel.ps1 -Setzen`).
  - **Stufe 2 – Prüfer, gezielt (1 Runde, kurzer Auftrag nur für den geänderten Bereich):** neue/geänderte Katalogregeln mit wenigen Wörtern, eine neue Oberflächen-Funktion in einem Bereich, Workflow-Änderungen.
  - **Stufe 3 – Prüfer, voll (bis 3 Runden):** neue Funktionen über mehrere Bereiche, Katalogregeln mit breiter Wirkung (classify/works/dnb grundlegend), Datenbankschema/Suchfunktionen, alles vor einem Neuimport, Ressourcen-/Kostenfragen.
  - **Rein optische Anpassungen** (Farben, Abstände, Animationen, Unschärfe, Texte, Anordnung) brauchen **nie** den Prüfer – höchstens Stufe 1. Der Prüfer ist nur für Technisches (Logik, Daten, Navigation/Verlauf, Datenbank, Workflows, Katalogregeln). (Nutzer, 13.11.2026)
  - Faustregel: Je mehr Bücher oder Nutzer eine Änderung trifft und je weniger Tests den Bereich abdecken, desto höher die Stufe. Im Zweifel Stufe 2.
- **Nach jeder abgeschlossenen Änderung** an Code/Styles/Datenbank/Workflows/Tests (Stufe 2/3): Prüfer aufrufen, Mängel beheben, erneut prüfen – **höchstens 3 Runden**, dann mit Bericht an den Nutzer (Startwert, vom Nutzer bestätigt 08.11.2026; nach ~5 Aufträgen gemeinsam auswerten, wie viele Runden nötig waren, und anpassen). Im Bericht immer angeben, wie viele Runden es waren. **Während eine Prüfrunde läuft, keine neuen Fragen oder Änderungsvorschläge an den Nutzer** – erst wenn alle Runden durch sind, ein zusammenfassender Bericht mit allen offenen Entscheidungen (Wunsch des Nutzers, 08.11.2026). Geschmack, Kosten/Grenzen, rechtliche Fragen und größere Datenbankänderungen entscheidet immer der Nutzer.
- **Abschlussblock in jedem Bericht** (ganz am Ende, nach den Erklärungen, Wunsch des Nutzers 08.11.2026), damit auf einen Blick klar ist, woran er ist:
  ```
  ── Stand auf einen Blick ──
  ✅ erledigt: … (je Punkt eine Zeile)
  ❌ gescheitert/verworfen: … (mit Grund in wenigen Wörtern)
  ⏳ läuft noch: … (mit Zeitschätzung)
  ❓ deine Entscheidung: … (nur wenn offen)
  🔍 Prüfung: Stufe N, X Runden, Ergebnis
  ```
  Leere Zeilen weglassen.
- **Tests**: `tests/index.html` (Katalog, 46) und `tests/ui.html` (Oberfläche in 360 px, 48; eigene Daten bleiben unberührt, ein Testeintrag wird wieder gelöscht).
- **Prüf-Stempel** `tools/pruefstempel.ps1` (Hash über js, css, index.html, sw.js, supabase, scripts, tests, Workflows; Doku zählt nicht) → `.claude/pruefung.json` (nicht im Repository).
- **Stop-Hook** (`.claude/settings.json` → `.claude/hooks/stop-pruefung.ps1`): Ist der Stand ungeprüft, hält er Claude vor dem Beenden einer Antwort **einmal** an und fordert die Prüfung. Beim zweiten Mal lässt er durch (keine Endlosschleife). Ausnahme: Arbeit läuft noch (z. B. Import) oder reine Frage – kurz begründen.

## Bewusst später

- Konten (zunächst 5 zum Testen) mit Abgleich zwischen Geräten – siehe PLAN.md „Konten erstellen“

## Datenquellen

| Quelle | Zweck | Zugang |
|---|---|---|
| **DNB SRU** `https://services.dnb.de/sru/dnb` | Hauptquelle: Titel, Autor, Verlag, Jahr, Seiten, ISBN, Sachgruppe, Gattungsbegriff | Frei, keine Anmeldung, CORS erlaubt, Lizenz CC0. `recordSchema=MARC21-xml` für alle Felder, `oai_dc` für einfache Felder. |
| **DNB-Cover** `https://portal.dnb.de/opac/mvb/cover?isbn=<ISBN>` | **Nicht verwenden** | Im Browser schaltet portal.dnb.de eine Bot-Prüfseite vor („Dein Browser wird geprüft!“). Die wird **nicht umgangen**. |
| **Open Library** `https://covers.openlibrary.org/b/id/<COVER-ID>-M.jpg` | Cover (erste Wahl, IDs aus der Datenbank) | Frei, **ohne Ratenbegrenzung**. Die Cover-IDs holt der Import aus dem Open-Library-Datenexport (`ol_dump_editions_latest.txt.gz`). |
| **Open Library per ISBN** `https://covers.openlibrary.org/b/isbn/<ISBN>-M.jpg?default=false` | Nur letzte Möglichkeit | **Max. 100 Abrufe pro 5 Minuten und IP.** Danach hängen die Anfragen (kein Fehler!). Deshalb gibt es pro Cover-Quelle eine Zeitgrenze (`covers.timeoutMs`). |
| **Amazon-Cover** `https://images-na.ssl-images-amazon.com/images/P/<ISBN-10>.01._SCLZZZZZZZ_SY360_.jpg` | Cover (erste Wahl je ISBN, seit 09.11.2026) | Frei, ohne Schlüssel, nur ISBN-10 (978er). Fehlt das Cover, kommt ein 1×1-GIF. Abdeckung: Stichprobe 96 von 100, „dungeon“ 49 von 50 (Google 0 von 50). **Grauzone**, Nutzerentscheidung: genutzt mit Link „Bei Amazon ansehen ›“ im Detailblatt (`covers.amazonLink`). Amazon sieht, welche ISBNs angezeigt werden (wie bei Google). Geprüft und verworfen: VLB/MVB-Cover (nur für Bibliotheken, mit Zugangsschlüssel), buchhandel.de (liefert nichts), LibraryThing (erlaubt, aber nur von Mitgliedern hochgeladene, meist englische Cover). |
| **Google-Books-Cover** `https://books.google.com/books/content?vid=ISBN<ISBN>&printsec=frontcover&img=1&zoom=1` | Cover (zweite Wahl) | Frei, ohne Schlüssel. Fehlt das Cover, kommt ein PNG-Platzhalter („image not available“) mit **128×184 oder 128×170 px**. Er wird an der Größe erkannt und übersprungen. Kein CORS, deshalb kein Dateivergleich im Browser. Beim DB-Import serverseitig per Hash prüfen. |
| **DNB-Klappentext** `https://services.dnb.de/plus/idn/<IDN>/blurb/` | Klappentext (Verlagstext, ~80–90 % der Bücher) | Frei, aber **kein CORS** → Supabase Edge Function `blurb` (`supabase/functions/blurb`, Gratis 500.000 Aufrufe/Monat) holt ihn per ISBN; nichts wird gespeichert (wären ~300 MB). Veröffentlichen: Workflow „Supabase-Funktionen“ mit Secret `SUPABASE_ACCESS_TOKEN` (Rechte: Edge Functions read-write, Project Settings read). |
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
- **Tests**: `tests/cases.js` (36 Fälle gegen echte DNB-Datensätze, inkl. Herr der Ringe, Percy Jackson, Hobbit, Narnia, Biss). Im Browser `http://localhost:8080/tests/index.html`, auf GitHub Workflow „Tests“ (läuft bei jedem Push). Neue Grenzfälle dort ergänzen.
- Stichprobe 11/2026: Die Regeln entfernen ~13 % der Ausgaben, bei 1.787 geprüften Ausgaben ohne erkennbaren Fehlgriff.

## Analyse 11/2026: Franchises (Herr der Ringe, Hobbit, Harry Potter, Percy Jackson, Narnia …)

- **Titel aufräumen** (`js/titles.js`, beim Einlesen): Werbetext in eckigen Klammern („ : [der Fantasy-Bestseller …“), „[u.a.]“, Ausgabe-Zusätze nach Trennzeichen oder in Klammern („- Ausgabe zur TV-Serie“, „– Taschenbuch mit Filmcover“, „- Neuausgabe 2012“, „(Disney+ Sonderausgabe)“). „Die letzte Ausgabe“ ohne Trennzeichen bleibt.
- **Bandangabe im Titel**: „Der Herr der Ringe. Bd. 1 - Die Gefährten“, „Percy Jackson 1: Diebe im Olymp“ → Reihe + Band + Titel (ohne „Bd.“ nur bei mehrwortigen Reihen und max. 2-stelligen Nummern).
- **Reihenname vorne im Titel** abschneiden, wenn derselbe Autor diese Reihe hat („Percy Jackson – Diebe im Olymp“, „Game of Thrones – das Erbe von Winterfell“).
- **Gleicher Autor + gleiche Reihe + gleiche Bandnummer = ein Werk** (zwei Übersetzungen: „Die Wiederkehr/Rückkehr des Königs“). Nur mit Autor.
- **Verlagsreihen** („Carlsen 690“, „Reclams Universal-Bibliothek“, „Heyne“ …) gelten nicht als Reihe (`isPublisherSeries`).
- **Fan-/Film-/Begleitmaterial unabhängig von der Gattung raus**: (in)offiziell, Fanbuch, Filmbuch, Begleitbuch, „aus den Filmen“, Filmzitate, „unnützes Wissen“, Rollenspiel, Sichtschirm, Sticker-Buch, Pop-up, Schülerkalender, Reiseführer, Hobbit-Enzyklopädie/„Lexikon zu …“, Schuber, Box. Ohne Autor + Untertitel = bekannte Reihe → raus. „Roman zum Film“ bleibt (echte Geschichte mit Filmcover).
- **Sammelbände** („[u.a.]“, „I-VII“) raus; einbändige Gesamtausgaben („Der Herr der Ringe“ in einem Band) bleiben.
- **„Die drei ???“**: `normalizeText` macht aus „???“ das Wort „fragezeichen“ (sonst nicht suchbar).
- Gegenprobe an 1.779 Ausgaben: nur 4 zusätzliche Ausschlüsse (Geschenk-Boxen, Sammelband), kein Roman. Tests: 36.

## Stichprobe 11/2026: neue Bücher, Reihen, Selbstverlag

- **Reihen ohne Bandnummer** (490 ohne $v, z. B. „Selcouth-Reihe“ bei Rewitched/Uncharmed) gelten, wenn derselbe Autor ≥ 2 Bücher darin hat (`checkSeries` in works.js, Feld `looseSeries`). Hat kein Band der Reihe eine Nummer, zählt `numberSeries` (works.js) nach Erscheinungsjahr durch – **überall soll „Band 1“, „Band 2“ stehen** (nur bis 10 Bände; größere ungezählte Reihen wie Barbapapa behalten den Reihennamen). Reihenfolge nach Jahr. Namen aufgeräumt (`cleanSeriesName`: „-Reihe“, „-Trilogie“, „Band ... der …“).
- **Verlagsreihen**: Reihen mit **≥ 25 verschiedenen Autoren** fallen weg (Maxi Pixi, Unionsverlag Taschenbuch, Lesemaus …); echte Mehr-Autoren-Reihen liegen darunter (Das schwarze Auge 23, Warhammer 40,000 21). Dazu Namensmuster in `isPublisherSeries` (…taschenbuch/…bibliothek am Ende, Reihe …, Edition …, Lesestufe, Pixi …).
- **Selbstverlag über Amazon** raus (Verlag „Independently published“, CreateSpace, Kindle Direct; ISBN 979-8). **Amazons Verlagsprogramme mit Lektorat bleiben** (AmazonCrossing, Amazon Publishing, Tinte & Feder, Edition M – Entscheidung 08.11.2026).
- **Initialen**: „Rowling, J. K“ → „J. K. Rowling“ (`displayName`).
- **Untertitel im Titel** („Katzenjagd : Roman“, „… : basierend auf …“) abgetrennt, aber nicht „Star Wars : Das …“ (`splitTitleSubtitle`); „ / Ill. von …“ abgeschnitten.
- Lernblöcke, „Lernen ab 3 Jahren“, Freundebücher, DSA5-Rollenspiel raus; unplausible Jahre (1072, 3013) → leer.
- **Lern- und Beschäftigungsbücher** (Zählung 08.11.2026 im Katalog: ~1.000–2.000 geschätzt, je nach Muster 0–45 % echte Nicht-Bücher in der Stichprobe): zusätzlich Ordner/Verkaufseinheiten, Jahreskalender, Sudoku/Quiz/Rätselbücher, Übungsbücher, Kreativ-/Ausmalhefte, Schreiblernbücher; schwach (nur ohne erzählende Gattung): Mitmachbuch, Rezepte, Sprüche, Quiz, Sudoku, Kinderlieder, Liederbuch, „mit Ausmalbildern“, ABC-Buch (Prüfrunde 08.11.2026: diese trafen als starke Wörter echte Geschichten und Gedichte). Gegenprobe 2.400 Ausgaben: nur Nicht-Bücher getroffen. Ohne Gattung schützt ein erzählender Untertitel („Roman“, „Kriminalroman“, „Kurzgeschichten“, „Gedichte“ …) vor schwachen Wörtern. Nicht bei Aufzählungen mit Beschäftigungswörtern („Geschichten, Gedichte, Bastelideen und Rezepte“, „Sticker-Geschichten“). Eindeutige Erzählwörter (Roman, Krimi, Thriller, Novelle, Erzählung, Kurzgeschichten) schützen immer. „Verkaufs-Kassette“ fliegt immer raus, „Jahresheft“ nur ohne erzählende Gattung. **Rätselgeschichten** („Die drei ??? Kids – das große Rätselbuch“, Escape-Bücher) fallen raus (Nutzerentscheidung 08.11.2026). **Nachzählung nach dem Import 09.11.2026**: zusammengesetzte Malbücher („Ostermalbuch“, nicht „Denkmalbuch“), Witze-, Lern- („Register-Lernbuch“, nicht „Leselernbuch“), Puzzlebücher und „erste Wörter“ ebenfalls raus (~240 Werke, alle Treffer geprüft). **Pappbilderbücher** (Gattung „Pappbilderbücher…“, ~5.900 Werke) und **Spielleiter-Schirme** (auch „Dungeon Master's Screen“) raus – Nutzerentscheidung 09.11.2026, wirkt ab dem Import am 01.12.2026.
- **Sachliches per Titelwort: ausprobiert und verworfen (08.11.2026).** Eine Regel gegen Memoiren, „wahre Geschichten“, Gebete, Kolumnen, Ratgeber traf in der Zufallsstichprobe nur 0,07 % des Katalogs, aber 6–9 % ihrer Treffer waren Romane (Woolf „Orlando : eine Biographie“, Jean Paul, „Maigrets Memoiren“, Lukian „Wahre Geschichten“, Danielle Steel „Erhörte Gebete“, Tiere als Erzähler). Fiktive Memoiren und Biografien sind eine Romanform – am Titel nicht sicher unterscheidbar. Nutzer: „wenn nichts anderes mit fliegt“, sonst so lassen → bleibt so (~93 % Belletristik).
- **Zielbild des Nutzers: Belletristik / Fiction** = Bücher zum Lesen (Romane, Krimis, alles Erzählende, auch Lyrik/Drama), keine Sach-, Lehr- oder Beschäftigungsbücher. Stichprobe 300 Zufallswerke (08.11.2026): ~85 % erzählende Prosa, ~8 % Lyrik/Drama, ~6 % Sachliches (Memoiren/„wahre Geschichte“, Gebete, Ratgeber, Reiseberichte, Kolumnen, Freundebuch, Verkaufsdisplay), ~1 % unklar.
- **Cover neuer Bücher**: ab 2020 haben nur ~15 % ein Cover über Google/Open Library. Die DNB hätte fast alle, ist aber durch eine Bot-Prüfung geschützt – **auch nicht über einen eigenen Server abrufen** (verworfen 08.11.2026). Für Katalog-Werke entfällt die langsame Open-Library-ISBN-Abfrage (Cover-IDs kennt die Datenbank, `fromDb`).
- Tests: 42.

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
- **DNB-Ratenbegrenzung**: Ab 11/2026 antwortet die DNB beim Import nach ~1 h mit Fehler 429. Der Import pausiert dann gemeinsam (1, 2, 3 … Minuten, bis 15 Versuche) und läuft mit nur 2 parallelen Anfragen.
- **Werke ohne ISBN** werden nicht importiert (~13 %: Buchclub-Ausgaben, Heftromane, Selbstverlage, Merchandise, Katalog-Sammeleinträge).
- **Cover**: nur Open-Library-Cover-IDs speichern, keine Bilder. Reihenfolge in der App (`coverUrls` in card.js): eigene Ausgabe per Amazon, dann Google → Open-Library-Cover-ID → weitere ISBNs per Amazon, dann Google → Open Library per ISBN → Platzhalter.
- **Import-Workflow** `.github/workflows/import.yml`: manuell (Jahre/Sachgruppen wählbar, Probelauf, „Katalog leeren“) und monatlich am 1. Die DNB wird nach Jahr × Sachgruppe aufgeteilt (Blättergrenze 100.000), 3 Anfragen parallel. Nur geänderte Zeilen werden geschrieben, damit die Datenbank nicht aufbläht.
- **Diagnose**: Workflow „Diagnose“ (`scripts/diagnose.mjs`, nur lesend) zeigt Index-/Tabellengrößen und EXPLAIN-Pläne; eigene SELECTs als Eingabe.
- **Verbindungstest/Größen**: Workflow „Supabase wach halten“ (`scripts/ping.mjs`) zeigt Benutzer/Host (nie das Passwort) und die Tabellengrößen. Er läuft alle 3 Tage, damit Supabase nicht pausiert.
- **Achtung GitHub**: Zeitgesteuerte Workflows in öffentlichen Repos werden nach 60 Tagen ohne Commit deaktiviert. GitHub schickt vorher eine Mail, dann im Actions-Tab wieder aktivieren.
- **Datenquelle austauschbar**: `js/catalog.js` nutzt Supabase, wenn `CONFIG.supabase` gesetzt ist, sonst die DNB live. ISBN-Suchen laufen immer über die DNB (ungefiltert). Bei Datenbankfehlern greift automatisch die DNB.
- **Testhinweis Browser-Ansicht:** Lazy-Bilder laden in Hintergrund-Tabs nicht. Vor Cover-Tests den Tab nach vorne holen.
- **Eigene Einträge sind Kopien der Buchdaten** (IndexedDB). Barcode-/ISBN-Suche holt die Ausgabe live von der DNB und sucht dann das ganze Werk im Katalog (`dbWorkForIsbn` in catalog.js: Volltextsuche Titel + Nachname, Treffer über die ISBN). Erscheint ein Werk aus der Datenbank in Suche/Stöbern, frischt `refreshEntry` (library.js) Titel, Jahr, Reihe, Genre, ISBNs und Cover-IDs des eigenen Eintrags auf – eigene Angaben bleiben. (Fall Rewitched: per Scan „2026“ gespeichert, Werk ist von 2025.)
- Die eigenen Markierungen liegen weiterhin lokal in IndexedDB. Später optional Abgleich über Supabase mit Anmeldung.

## Technik

- **PWA mit reinem HTML, CSS und JavaScript**, ohne Build-Schritt und ohne Frameworks, die einen Build brauchen. Auf dem Rechner sind **weder Node.js noch Python installiert**.
- Eigene Daten (Besitz, gelesen, Bewertung, Ausgabe) liegen lokal in **IndexedDB**. Export und Import als JSON-Datei dienen als Backup.
- Hosting kostenlos auf **GitHub Pages** (oder Cloudflare Pages). Auf dem Handy wird die App über „Zum Startbildschirm hinzufügen“ installiert.
- Service Worker für die Offline-Nutzung von „Meine Bibliothek“. Die Live-Suche braucht Internet. Er fragt mit `cache: no-cache` immer beim Server nach (GitHub Pages erlaubt sonst 10 Minuten Zwischenspeicher – neue Versionen kamen verspätet an).
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

## Gestaltungsregeln (Stand 06.11.2026)

- **Rahmen** (Liste und Raster): grün = im Besitz, gold = gemerkt (und nicht im Besitz), sonst neutral.
- **Knöpfe einheitlich**: nicht angewählt = nur Rand; angewählt = **leicht gefüllt + farbiger Rand** (Besitze/Gelesen grünlich, Merken gold). Feinschliff der Farben folgt später.
- Detailblatt-Knöpfe heißen „Besitze“, „Gelesen“, „Merken“ (wie in der Liste).

## Analyse 09.11.2026: Känguru (Marc-Uwe Kling) und Box-Datensätze

- „Die Känguru-Chroniken“ stand als „Chroniken“ in der Suche: Die Regel „Reihenname vorne im Titel abschneiden“ hielt den Bindestrich im Wort für einen Trenner. Jetzt nur echte Trenner („ - “, „ – “, „:“).
- Die DNB nennt die Reihe je Ausgabe „Die Känguru-Werke/-Trilogie/-Tetralogie/-Pentalogie“ → alles auf „Die Känguru“ (`cleanSeriesName`, „-Werke“ nur mit Bindestrich). Ein Anzeigename „Die Känguru-Reihe“ erzeugte Phantom-Werke („Die Wellenläufer-Reihe“) und wurde verworfen.
- Band 4 fehlte, weil er nur im Box-Datensatz ohne Autor steht: **Box-Bände ohne Autor** werden mit dem gleichnamigen Werk verbunden, wenn genau ein Autor diesen Titel hat; die Hauptausgabe ist eine mit Autor. **Reihen aus Box-Datensätzen** zählen nur, wenn dieselbe Reihe auch bei einer normalen Ausgabe vorkommt (Sammelbox „Mein Kinderbuchhaus“).
- Gegenprobe alt gegen neu (je 100–200 DNB-Datensätze, 3 Prüfrunden): Rowling, Riordan, Funke, Collins, Paolini, Kinney, Fitzek, G. R. R. Martin, Maas, Pratchett, Kai Meyer, Gier, Hennen, Die drei ???, Schule der magischen Tiere ohne Unterschied; Känguru korrekt Band 1–5; Tolkien 2 Box-Bände eingegliedert. Bekannter Rest: Pippi Langstrumpf erbt die Verlagsreihe „Mein Kinderbuchhaus“ (Band 5) einer Einzelausgabe – vorher war die Pippi-Zählung ebenfalls falsch.
- Wirkt im Katalog ab dem nächsten Import (01.12.2026).

## Darstellung, Geschenk, Auffrischen (10.11.2026)

- **Modus Automatisch/Hell/Dunkel** (settings `scheme`, data-scheme an <html>; Dunkel-Regeln in style.css gelten im Media-Query nur ohne data-scheme="light" und zusätzlich immer bei data-scheme="dark"). **Stil „Papier & Tinte“** (Standard) oder „Klassisch“, **7 Akzentfarben** (inkl. Rosa seit 12.11.2026) – `js/theme.js`, Reiter „Einstellungen“ → „Darstellung“, pro Gerät (settings `style`, `accent`). Titel in Buchschrift (Iowan Old Style/Palatino/Georgia, nichts wird geladen). Inline-Skript im `<head>` setzt Stil/Farbe vor dem ersten Zeichnen.
- **Geschenk-Link** `…/#g=<Base64url JSON {n,m,c,v}>` (`js/gift.js`): Name in der Kopfleiste, Farbe, Geburtstagsgruß beim ersten Öffnen (settings `gift`, `giftSeen`; gilt je Speicher – Safari und die installierte App haben getrennten Speicher, darum erscheint er in beiden einmal). Ein neuer Link überschreibt nur, wenn er sich vom gespeicherten unterscheidet. **Manifest ohne `start_url`**, damit „Zum Home-Bildschirm“ den Link mit `#g` übernimmt. Druckkarte `karte.html#g=…` mit QR-Code (qrcode-generator von jsDelivr). **Persönliche Daten nie ins Repository** – Beispielname in Code/Tests ist „Anna“. „Geschenk von diesem Gerät entfernen“ (Darstellung) zum gefahrlosen Testen. 🎂-Knopf in der Kopfleiste (nur mit Geschenk) spielt den Gruß erneut; leise „Happy Birthday“-Melodie (gemeinfrei) per Web Audio, ~4 s, am iPhone erst nach einer Berührung. Karte ohne Link-Text. **Gruß nur mit Name, Text, Absender und „Los geht’s“** (Infotexte und Ständchen-Knopf entfernt, 12.11.2026); „Los geht’s“ startet das Ständchen (falls noch nicht gelaufen) und eine **Konfetti-Explosion** über der App (`burstConfetti`, Canvas ohne Berührungen, ~3 s, entfällt bei „Bewegung reduzieren“). **Kurzlink `…/#fuer-<code>`** (11.11.2026): Name/Gruß in Tabelle `gifts` (RLS ohne Policy, nicht auflistbar, anon nicht schreibbar), Abruf nur per `gift_by_code(code)` (security definer); eingetragen über Workflow „Geschenke speichern“ aus dem GitHub-Secret `GIFTS` (JSON {code:{n,m,c,v}}; Secret legt der Nutzer selbst an, Log zeigt keine Codes). App zeigt das gespeicherte Geschenk sofort und prüft die DB im Hintergrund (max. 3 s). Karte `karte.html#fuer-<code>`.
- **Eigene Einträge auffrischen**: `refreshAllFromDb` (library.js) beim Start, höchstens alle 12 h, REST `works?id=in.(…)` je 40 Schlüssel (300 Einträge ≈ 0,9 s, ~145 KB).
- **Fehlender Band 1** (`numberSeries`): genau ein Buch ohne Nummer in einer nummerierten Reihe, Band 1 frei, nicht jünger als Band 2, und kein anderes Buch des Autors heißt wie die Reihe (Doctorow „Little Brother“) → Band 1 (Dungeon Crawler Carl, Eagle Rider). Hochrechnung: ~219 Reihen. Wirkt ab Import 01.12.2026.

## App-Gefühl, Paket 1 (12.11.2026, ANFORDERUNGEN F3)

- **Reiter unten** (`nav.tabs.tabbar`, fest, über dem Home-Balken): Suche · Meine Bücher (Anzahl als Abzeichen) · Zufall · Einstellungen, Symbole als Inline-SVG (Zahnrad nach Lucide, ISC). Kopfleiste nur noch Titel + Scan/Raster (Raster-Schalter bei Zufall/Einstellungen ausgeblendet, `body[data-view]`).
- **Einstellungen** = eigener Reiter `#view-settings` (Darstellung, Daten sichern; `renderSettings` in app.js) statt zugeklappt unter Meine Bücher.
- **Laden**: `showSkeleton` zeigt 4 schimmernde `.skel-card` (eigene Klasse, **nicht** `.book`, sonst zählen Tests/Code sie mit); stehen schon Treffer da, werden sie nur abgeblendet (`#results.stale`). Cover blenden in .35 s ein.
- **Leere Seiten**: `emptyState()` in util.js (Symbol, Überschrift, Satz, Knopf) – überall: Suche, Stöbern, Meine Bücher, Reihen, Regal, Statistik. Im Raster sind die Lade-Platzhalter cover-förmig.
- **Detailblatt**: `.sheet-hero` = geladenes Cover, stark verschwommen, oben im Blatt, läuft nach unten aus (Deckkraft hell .5, dunkel .55).
- Bewusst zurückgestellt (Nutzer will erst vergleichen): Knopf-Einrasten mit Animation, „Rückgängig“ auch in der Liste (Paket 3, Punkte 1–2).

## Paket 3, Punkte 1–2, und Zurück-Geste (12.11.2026, ANFORDERUNGEN F4)

- **Einrasten**: `snap(btn)` in card.js (Klasse `snap`, Animation; Liste und Detailblatt).
- **Kein „Rückgängig“ in Listen** (war kurz drin, Nutzer hat es wieder herausgenommen); Raster-Gesten behalten „↶ Rückgängig“.
- **Weiche Übergänge**: `animateIn(node, fwd|back|fade)` in util.js (CSS-Animation .2–.24 s): Stöbern/Regal vorwärts von rechts, zurück von links, Reiter/Unteransicht einblenden.
- **Detailblatt-Hintergrund** weniger verschwommen (blur 14 px statt 30, scale 1.12); Angaben im Kopf dafür kräftiger (`.sheet-facts` 80 % Textfarbe).
- **Zurück** (`js/nav.js`): Bereiche melden per `registerBack(() => fn|null)`, wie „zurück“ bei ihnen geht (Stöbern → `endBrowse`, geöffnetes Regal → Übersicht). Stöbern hat einen Stapel `browseStack` (13.11.2026): jede Stöbern-Seite legt die vorige Stöbern-Seite bzw. die Ausgangsansicht (view, Suchtext, Scrollstand) ab; `endBrowse()` geht genau eine Stufe zurück, `endBrowse(false)` (neue Suche, Feld geleert) leert den Stapel und spult die eigenen Verlaufseinträge zurück (`rewindTo`, Einträge tragen `depth`); Stöbern aus einem anderen Reiter beginnt einen neuen Stapel. Beim Betreten `enterLevel()` = `history.pushState({bibBack:true}, '')` (URL bleibt, `#fuer-…` bleibt), „‹“-Knöpfe rufen `goBack()` → `history.back()` → `popstate` führt die Aktion aus. So wirken Safaris Randgeste und Android-Zurück. Die installierte iPhone-App hat keine eigene Geste → `attachEdgeSwipe()` (nur bei `navigator.standalone`; Start in den linken 18 px; Seite folgt dem Finger zu 90 %, auslösen ab 90 px oder Schwung ≥ 0,45 px/ms ab 40 px; dann gleitet `main` in .16 s hinaus und die vorige Seite per `animateIn` von links herein; sonst Zurückfedern .28 s). Nicht bei offenem Detailblatt/Vollbild/Gruß/Scanner. Das Detailblatt bekommt bewusst keinen eigenen Verlaufseintrag; ist es offen, schließt Zurück (popstate) aber zuerst das Blatt und trägt die Ebene neu ein (`registerOverlay`). Sperre gegen doppeltes „‹“ (600 ms bis popstate). Filter „Besitze“: abgewähltes Buch bleibt bis zum Neuzeichnen stehen (wie bisher, Entscheidung offen).
- Tests: tests/ui.html 48.
