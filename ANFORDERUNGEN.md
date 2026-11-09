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
| B7 | Nichts wird ausgegraut, keine Abzeichen am Cover. | S |

## C – Buchkarte, Raster, Detailblatt

| ID | Anforderung | Prüfart |
|---|---|---|
| C1 | Buch-Slot: Cover 80×120 (360 px: 72×108), Titel max. 2 Zeilen, Autor, Infozeile („Band 2 · Jahr · Genre“), Pillen ○ Besitze · □ Gelesen · ♡ Merken, „⋯“ oben rechts. Alle Slots gleich hoch. | S |
| C2 | **Bei Reihen steht immer „Band N“** (Reihenname nur im Detailblatt oder bei großen ungezählten Reihen). | T + S |
| C3 | Rahmen: grün = Besitz, gold = gemerkt (ohne Besitz). Knöpfe: nicht gewählt = Rand, gewählt = leicht gefüllt + farbiger Rand. | S |
| C4 | Cover-Raster: 2 Cover pro Reihe, nur Symbole ○/● □/■ ♡/♥; Gesten: Tipp = Titel + „Details ›“, Doppeltipp = Besitze, rechts wischen = Merken, links = Gelesen, halten = Detailblatt; danach 2,5 s „↶ Rückgängig“. | S + H |
| C5 | Detailblatt: Cover, Titel, Autor (antippbar → Autorenseite), Reihe/Jahr/Genre („Mehr <Genre> ›“), Knöpfe, Klappentext (5 Zeilen + „Mehr lesen“, fehlt er → Abschnitt weg), Bewertung, Lesedatum, Regale, Notiz, Ausgaben zugeklappt. | T + S |
| C6 | Detailblatt lässt sich nach unten wegziehen (Griff immer, Inhalt nur ganz oben; > 30 % oder Schnippen schließt). Knöpfe reagieren nicht auf Darüberwischen. | T + H |
| C7 | Haptik am iPhone bei Besitze/Gelesen/Merken (echter Schalter), kein Doppeltipp-Zoom. | H |
| C8 | Größere Cover: Ansicht-Schalter oben wechselt Liste → Raster (2 je Reihe) → Groß (1 je Reihe, Cover in höherer Auflösung, gleiche Gesten), pro Gerät gespeichert; Symbol zeigt die nächste Ansicht. Im Detailblatt öffnet ein Tipp aufs Cover ein Vollbild (Tippen, ×, Escape oder Wischen schließt; Escape schließt nur das Vollbild). | T + S + H |

## D – Stöbern und Meine Bücher

| ID | Anforderung | Prüfart |
|---|---|---|
| D1 | Ohne Suche: 15 Genre-Knöpfe; ein Genre zeigt die beliebtesten Bücher, 50 je Seite, **unter 1 s**. | T + M |
| D2 | Autorenseite: alle Bücher A–Z, eigene oben, Reihen zusammen; „‹“ stellt die vorherige Suche wieder her. | T |
| D3 | Meine Bücher: Liste (Filter Besitze/Gelesen/Ungelesen/Merkliste/Alle + Regal, Sortierungen), Reihen, Statistik. | S |
| D4 | Eigene Einträge werden mit Katalogdaten aufgefrischt, eigene Angaben bleiben. | T |
| D5 | Merkliste: „Besitze“ nimmt ein Buch von der Merkliste. „Gelesen“ setzt das Lesedatum auf heute. | S |
| D6 | Sicherung: Export/Import als JSON. Offline: „Meine Bücher“ funktioniert ohne Netz. | S |

## E – Katalogqualität

| ID | Anforderung | Prüfart |
|---|---|---|
| E1 | Nur deutsche, gedruckte Belletristik/Kinder-/Jugendbücher ab 2000, ohne Hochschulschriften und Selbstverlag (inkl. Amazon). | T + M |
| E2 | Ausgaben eines Buchs = ein Werk (Eragon „Der Auftrag des Ältesten“ 5–12 Ausgaben; HdR Band 3 ein Werk). | T |
| E3 | Keine Nicht-Bücher (Kalender, Malbücher, Fan-/Film-/Begleitbücher, Boxen, Lernblöcke, Rollenspiel). Stichprobe von 200 Zufallswerken: **höchstens 2 Nicht-Bücher**. | T + M |
| E4 | Reihen richtig: echte Reihen erkannt (auch ohne Nummer, ≥ 2 Bücher desselben Autors), Verlagsreihen (≥ 25 Autoren, Namensmuster) nicht. Stichprobe: **höchstens 2 Verlagsreihen** unter 200 Werken. | T + M |
| E5 | Titel sauber: keine Werbetexte, kein „ : Roman“, kein „ / Ill. von“. Namen mit Punkt nach Initialen. Stichprobe: höchstens 3 unsaubere Titel unter 200. | M |
| E6 | Cover: Anteil mit Cover je Jahrgang wird gemessen und berichtet (Ziel: steigend; Quellen nur kostenlos und erlaubt). | M |

## Eingang (neue Wünsche, noch nicht eingeordnet)

-
