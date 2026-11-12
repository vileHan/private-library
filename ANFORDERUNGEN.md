# Anforderungen und Abnahmekriterien

Diese Liste prüft der **Prüfer-Agent** (`.claude/agents/pruefer.md`) nach jeder Änderung. Jeder Punkt ist so formuliert,
dass man ihn messen oder eindeutig beobachten kann. Neue Wünsche einfach unten unter „Eingang“ notieren (auch unsortiert) –
Claude formuliert sie in prüfbare Punkte um und sortiert sie ein.

Prüfart: **T** = automatischer Test (`tests/index.html`, `tests/ui.html`), **M** = Messung (Diagnose-Workflow, Zeiten, Größen),
**S** = Sichtprüfung im Browser (Handybreite 375 px und 360 px), **H** = nur am Handy prüfbar (→ Liste „Bitte am Handy ausprobieren“).

## A – Grundregeln

| ID | Anforderung | Prüfart |
|---|---|---|
| A1 | Alles kostenlos: nur Gratis-Tarife, Grenzen eingehalten (Supabase 500 MB DB, 5 GB Datenverkehr, 500.000 Funktionsaufrufe; GitHub-Actions-Laufzeit). Datenbank **unter 450 MB** (Puffer). | M |
| A2 | Oberfläche und Daten auf Deutsch. | S |
| A3 | Keine Schlüssel oder Passwörter im Repository (nur der öffentliche Publishable-Key in `js/config.js`). | T (grep) |
| A4 | Keine Schutzmaßnahmen fremder Dienste umgehen (z. B. DNB-Bot-Prüfung bei Covern). | S (Code-Durchsicht) |
| A5 | Mobil zuerst: auf 360 px und 375 px Breite **kein waagrechtes Scrollen**, nichts abgeschnitten; am PC gut nutzbar. | T + S |

## B – Suche

| ID | Anforderung | Prüfart |
|---|---|---|
| B1 | Suche nach Titel, Autor oder ISBN. Live-Suche ab 3 Buchstaben nach 500 ms, ohne Aufklappliste. | T |
| B2 | Eigene Bücher (Besitz) stehen oben, darunter der Rest. | T |
| B3 | Passt die Suche zu einer Reihe, steht sie oben in Bandfolge („eragon“ → Band 1, 2, 3, 4). | T |
| B4 | Testsuchen (harry, eragon, zeh, kind, liebe, fitzek, drache, unterleutn) antworten **unter 1 s**, keine über 3 s. | M |
| B5 | ISBN/Barcode zeigt das ganze Werk aus dem Katalog (alle Ausgaben, erstes Jahr): 9783404015061 → „Rewitched“, 2025. Bücher außerhalb des Katalogs (Sachbuch) werden über die DNB trotzdem gefunden. | T |
| B6 | Seitenweises Laden („Mehr laden“) statt alles auf einmal. | T |
| B7 | Suchleiste ohne Lupe (Tastatur-„Suchen“ und Live-Suche reichen), „×“ am Ende leert die ganze Suche (nur sichtbar bei Text, Tastatur bleibt offen). Berührung außerhalb der Suchleiste schließt die Tastatur. | T + H |
| B7 | Nichts wird ausgegraut, keine Abzeichen am Cover. | S |

## C – Buchkarte, Raster, Detailblatt

| ID | Anforderung | Prüfart |
|---|---|---|
| C1 | Buch-Slot: Cover 80×120 (360 px: 72×108), Titel max. 2 Zeilen, Autor, Infozeile („Band 2 · Jahr · Genre“), Pillen ○ Besitze · □ Gelesen · ♡ Merken, „⋯“ oben rechts. Alle Slots gleich hoch. | S |
| C2 | **Bei Reihen steht immer „Band N“** (Reihenname nur im Detailblatt oder bei großen ungezählten Reihen). | T + S |
| C3 | Rahmen: grün = Besitz, gold = gemerkt (ohne Besitz). Knöpfe: nicht gewählt = Rand, gewählt = leicht gefüllt + farbiger Rand. | S |
| C4 | Cover-Raster: 2 Cover pro Reihe, nur Symbole ○/● □/■ ♡/♥; Gesten: Tipp = Titel + „Details ›“, Doppeltipp = Besitze, rechts wischen = Merken, links = Gelesen, halten = Detailblatt; danach 2,5 s „↶ Rückgängig“. | S + H |
| C5 | Detailblatt: Cover, Titel, Autor (antippbar → Autorenseite), Reihe/Jahr/Genre („Mehr <Genre> ›“), Knöpfe, Klappentext (5 Zeilen + „Mehr lesen“, fehlt er → Abschnitt weg), Bewertung, Lesedatum, Regale, Notiz, Ausgaben zugeklappt. | T + S |
| C6 | Detailblatt lässt sich nach unten wegziehen (Griff immer, Inhalt nur ganz oben; > 30 % oder Schnippen schließt). Knöpfe reagieren nicht auf Darüberwischen; ein Wischen, das auf einem Knopf oder Cover beginnt, scrollt trotzdem die Liste. | T + H |
| C7 | Haptik am iPhone bei Besitze/Gelesen/Merken (echter Schalter), kein Doppeltipp-Zoom. | H |
| C8 | Cover-Vollbild: In der Liste (nicht im Raster) und im Detailblatt öffnet ein echter Tipp aufs Cover ein Vollbild in größerer Fassung; Wischen/Scrollen öffnet nichts. Jede nächste Aktion (Berührung, Mausrad, Taste) schließt es, ohne darunter etwas auszulösen; der Geisterklick nach dem öffnenden Tipp schließt es nicht. Ein Wischen auf dem Vollbild schließt es und scrollt die Liste in derselben Bewegung. Escape schließt nur das Vollbild. | T + H |

## D – Stöbern und Meine Bücher

| ID | Anforderung | Prüfart |
|---|---|---|
| D1 | Ohne Suche: 15 Genre-Knöpfe; ein Genre zeigt die beliebtesten Bücher, 50 je Seite, **unter 1 s**. | T + M |
| D2 | Autorenseite: alle Bücher A–Z, eigene oben, Reihen zusammen; „‹“ stellt die vorherige Suche wieder her. | T |
| D3 | Meine Bücher: Liste (Filter Besitze/Gelesen/Ungelesen/Merkliste/Alle + Regal, Sortierungen), Reihen, Statistik. | S |
| D4 | Eigene Einträge werden mit Katalogdaten aufgefrischt, eigene Angaben bleiben. | T |
| D5 | Merkliste: „Besitze“ nimmt ein Buch von der Merkliste. „Gelesen“ setzt das Lesedatum auf heute. | S |
| D6 | Sicherung: Export/Import als JSON. Offline: „Meine Bücher“ funktioniert ohne Netz. | S |
| D7 | Reihe im Detailblatt („Eragon, Band 2 ›“) antippen → alle Bände der Reihe in Bandfolge (auch mit mehreren Autoren, Bände ohne Nummer nach Jahr dahinter), Leiste „‹ Reihe“, Zurück stellt die Suche wieder her; < 1 s. | T |
| D8 | Status „Abgebrochen“ (Detailblatt, Meine Angaben): zählt nicht als gelesen (setzt Gelesen/Lesedatum zurück; Gelesen hebt Abgebrochen auf), eigener Filter in Meine Bücher, „abgebrochen“ in der Infozeile, nicht unter „Ungelesen“, Kachel in der Statistik. | T |
| D9 | Meine Bücher (Variante B, 10.11.2026): Unteransichten Liste · Reihen · Regale · Statistik. Liste nur mit Filtern, Sortierung und wischbarer Filterzeile (nichts gequetscht). „Regale“: Übersicht mit Anzahl und Cover-Streifen, „+ Neues Regal“, Antippen zeigt die Bücher, Umbenennen und Löschen (Bücher bleiben). Würfel-Reiter „🎲“ rechts neben Suche/Meine Bücher: Erklärung im leeren Ergebnisfeld, „Ungelesen“ und „Gemerkt“ als Knöpfe (beide wählbar), „Regale ▾“ mit Häkchen (mehrere), Würfeln, nie zweimal hintereinander dasselbe, gelesene/abgebrochene nie. | T + S |
| D10 | Statistik: Jahresziel (pro Gerät, „X von Y Büchern“, Balken), dazu Gelesen pro Monat (laufendes Jahr), Seiten pro Jahr, Genres (gelesen), Lieblingsautoren nach Bewertung (ab 2 Büchern), dickstes/dünnstes Buch, Ø Seiten, abgebrochen. | T + S |
| D11 | Datensicherung (Exportieren/Importieren): enthält neben allen Einträgen auch leere Regale und Jahresziele; Import führt Regale zusammen und übernimmt Jahresziele nur für Jahre ohne eigenes Ziel. | T |

## E – Katalogqualität

| ID | Anforderung | Prüfart |
|---|---|---|
| E1 | Nur deutsche, gedruckte Belletristik/Kinder-/Jugendbücher ab 2000, ohne Hochschulschriften und Selbstverlag (inkl. Amazon). | T + M |
| E2 | Ausgaben eines Buchs = ein Werk (Eragon „Der Auftrag des Ältesten“ 5–12 Ausgaben; HdR Band 3 ein Werk). | T |
| E3 | Keine Nicht-Bücher (Kalender, Malbücher, Fan-/Film-/Begleitbücher, Boxen, Lernblöcke, Rollenspiel). Stichprobe von 200 Zufallswerken: **höchstens 2 Nicht-Bücher**. | T + M |
| E4 | Reihen richtig: echte Reihen erkannt (auch ohne Nummer, ≥ 2 Bücher desselben Autors), Verlagsreihen (≥ 25 Autoren, Namensmuster) nicht. Stichprobe: **höchstens 2 Verlagsreihen** unter 200 Werken. | T + M |
| E5 | Titel sauber: keine Werbetexte, kein „ : Roman“, kein „ / Ill. von“. Namen mit Punkt nach Initialen. Stichprobe: höchstens 3 unsaubere Titel unter 200. | M |
| E6 | Cover: Anteil mit Cover je Jahrgang wird gemessen und berichtet (Ziel: steigend; Quellen nur kostenlos und erlaubt). | M |

## F – Darstellung und Geschenk (10.11.2026)

| ID | Kriterium | Prüfart |
|---|---|---|
| F1 | Darstellung (Meine Bücher → „Darstellung“): Stil „Papier & Tinte“ (Standard; Cremepapier, Buchschrift für Titel, ruhige Kopfleiste) oder „Klassisch“, 7 Akzentfarben (Tinte, Salbei, Bordeaux, Ocker, Pflaume, Petrol, Rosa), hell und dunkel lesbar, pro Gerät gespeichert, kein Aufblitzen beim Laden. | T + S |
| F2 | Geschenk-Link …/#g=<Code>: Name in der Kopfleiste („Annas Bibliothek“), optional Akzentfarbe, Geburtstagsgruß beim ersten Öffnen (nur Gruß und „Los geht’s“, danach Konfetti über der App; je Gerät/App einmal, später per 🎂 wieder abrufbar). Daten nur im Link und im Gerätespeicher, nie im Repository. Druckbare Karte karte.html#g=<Code> mit QR-Code und Anleitung. | T + S + H |
| F3 | App-Gefühl (12.11.2026): Reiter **unten** (Suche · Meine Bücher · Zufall · Einstellungen) mit Symbol und Beschriftung, fest am Rand, über dem Home-Balken des iPhones; Einstellungen (Darstellung, Daten sichern) als eigener Reiter statt unter Meine Bücher; beim Laden schimmernde Platzhalter-Karten (bzw. alte Treffer abgeblendet statt Flackern), Cover blenden weich ein; leere Seiten mit Symbol, Überschrift, Satz und Knopf („Bücher suchen ›“, „Barcode scannen ›“). Detailblatt: Cover verschwommen als Hintergrund oben, Text bleibt hell und dunkel gut lesbar. Nichts verdeckt Inhalte (Kurzmeldung, letzte Karte, Detailblatt). | T + S + H |
| F4 | Bedienung (12.11.2026): Besitze/Gelesen/Merken rasten beim Antippen sichtbar ein (kurz eindrücken, Symbol springt; bei „Bewegung reduzieren“ ohne Animation). Kein „Rückgängig“ nach Knöpfen in der Liste (kurz eingebaut, auf Wunsch wieder raus, 12.11.2026). **Weiche Übergänge**: Autor-/Genre-/Reihenseite und geöffnetes Regal schieben sich von rechts herein, zurück von links; Reiter- und Unteransichtswechsel blenden kurz ein (≈0,2 s, bei „Bewegung reduzieren“ ohne). **Zurück** führt genau dorthin, woher man kam (13.11.2026): von einer Stöbern-Seite zur vorigen Stöbern-Seite (Autor → Reihe → zurück = Autor) bzw. zur Ausgangsansicht (Suche, Meine Bücher, Zufall) mit Scrollstand; die Suche im Such-Reiter bleibt erhalten; kam man aus einem Detailblatt, ist es danach sofort wieder offen, ohne Springen; ein offenes Detailblatt lässt sich per Wischen vom linken Rand nach rechts schließen; vom geöffneten Regal zur Regal-Übersicht – per „‹“, per Wischen vom linken Rand nach rechts (installierte iPhone-App: eigene Geste nach iPhone-Vorbild – Seite folgt dem Finger, darunter erscheint die vorige Seite; nach rechts werfen = zurück, nach links werfen = bleiben, auch nach weitem Ziehen; ohne Schwung ab etwa halber Breite; Safari: eigene Geste des Browsers) und per Android-Zurück. Sonst (Reiter, Unteransichten, Startseite) passiert beim Zurück nichts Unerwartetes; der Geschenk-Link in der Adresse bleibt erhalten. | T + S + H |

## Eingang (neue Wünsche, noch nicht eingeordnet)

-
