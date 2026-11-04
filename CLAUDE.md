# Private Library – Projektbeschreibung

Eine private Bücher-App (PWA) fürs Handy: Ich suche nach einem Buchtitel und sehe sofort, ob ich das Buch schon besitze und ob ich es gelesen habe.

Sprache der Oberfläche und der Daten: **Deutsch**.

> **Oberste Regel: Alles muss kostenlos sein.** Kein kostenpflichtiger Dienst, kein bezahlter Tarif, keine kostenpflichtigen Claude-Funktionen. Nur Gratis-Tarife, und deren Grenzen werden eingehalten. Wenn etwas nur bezahlt ginge, wird eine kostenlose Alternative gesucht.

Repository: https://github.com/vileHan/private-library (Branch `main`, **öffentlich**, weil GitHub Pages nur so kostenlos ist).
Live-App: **https://vilehan.github.io/private-library/**. GitHub Pages veröffentlicht automatisch jeden Push auf `main` aus dem Wurzelverzeichnis.
Commits laufen mit der GitHub-noreply-Adresse (in der lokalen Git-Konfiguration gesetzt). Keine privaten Daten oder Schlüssel ins Repository.

## Kernfunktion (Phase 1)

- Suchfeld nach Titel (später auch Autor). Die Treffer kommen aus unserer **eigenen Katalog-Datenbank in Supabase**. Bis der Import fertig ist, kommen sie übergangsweise live von der DNB (siehe „Architektur“).
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

- **Supabase, Gratis-Tarif**: Postgres mit 500 MB, automatische REST-Schnittstelle, Zugriff aus der PWA mit dem öffentlichen `anon`-Key. Der Katalog ist dabei nur lesbar (Row Level Security).
- **Inhalt**: Werke und Ausgaben gemäß Katalogfilter (~735.000 Ausgaben), bereits zu Werken gruppiert. Zusätzlich: ermittelte **Cover-URL**, Genre auf Deutsch, Sachgruppe, Jahr, Verlag, ISBNs.
- **Keine Bilder speichern**, nur Cover-IDs. Reihenfolge in der App (`coverUrls` in card.js): eigene Ausgabe per Google → Open-Library-Cover-ID → weitere ISBNs per Google → Open Library per ISBN → Platzhalter.
- **Import-Workflow** `.github/workflows/import.yml`: manuell (Jahre/Sachgruppen wählbar, Probelauf ohne Datenbank möglich) und monatlich. Die DNB wird nach Jahr × Sachgruppe aufgeteilt (Blättergrenze 100.000). Dauer etwa 1,5 h plus Cover-Export. Schema in `supabase/schema.sql` wird bei jedem Lauf angewendet (idempotent).
- **Testhinweis Browser-Ansicht:** Lazy-Bilder laden in Hintergrund-Tabs nicht. Vor Cover-Tests den Tab nach vorne holen.
- **Speicherbudget beachten**: Nur die nötigen Felder ablegen, kein komplettes MARC. Zielgröße unter ~350 MB.
- **Fehlertolerante Suche** über Postgres `pg_trgm`, mit Index auf normalisiertem Titel und Autor.
- **Import und Aktualisierung** über **GitHub Actions** (läuft in der Cloud, lokal ist nichts nötig): Erstimport per DNB SRU seitenweise. Danach monatlich ein Abgleich neuer Datensätze. Die DNB höflich abfragen: Pausen zwischen Anfragen, wiederaufnehmbar bei Abbruch.
- **Gegen das Pausieren**: Supabase pausiert Gratis-Projekte nach 7 Tagen ohne Nutzung. Eine GitHub Action fragt die Datenbank deshalb regelmäßig einmal an, um das zu verhindern.
- **Zugangsdaten** (Service-Key für den Import) nur als GitHub Secret, **nie im Code oder Repository**. In der PWA steht ausschließlich der öffentliche `anon`-Key.
- **Datenquelle austauschbar**: Die PWA spricht eine Katalog-Schnittstelle an (`searchCatalog`, `getByIsbn` …). Dahinter steckt entweder die DNB live (Übergang) oder Supabase.
- Die eigenen Markierungen liegen zunächst lokal in IndexedDB. Später können sie optional in eine Supabase-Tabelle mit Anmeldung übertragen werden, damit Handy und PC denselben Stand haben.

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
- `js/works.js`: Ausgaben zu Werken gruppieren (Werkschlüssel + gemeinsame ISBN + DNB-Verknüpfung 776), Sortierung ohne führenden Artikel (DNB-Marker `\u0098…\u009C`)
- `js/catalog.js`: austauschbare Katalog-Schnittstelle (heute DNB, später Supabase)
- `js/store.js`: IndexedDB, Export/Import
- `js/library.js`: eigene Bibliothek im Speicher, `entryFor`, `updateEntry` (leere Einträge werden gelöscht)
- `js/card.js`: Buchkarte inkl. Ausgaben-Häkchen und Detailbereich
- `js/series.js`, `js/stats.js`: Reihen- und Statistik-Ansicht
- `js/util.js`: kleine Helfer
- `js/app.js`: Suche, Meine Bücher, Tabs, Sicherung
- Mobil zuerst (Handy-Breite), muss aber auch am PC gut nutzbar sein.
