# F-009 — Lexikon

Status: freigegeben · 26.10.2026 · Freigabe: Mensch, 26.10.2026 (inkl. vitest als devDependency)

## Ziel

Eigennamen und Fachbegriffe, die die Spracherkennung falsch schreibt, pflegen
(Voitex-Seite „Lexikon“). Wirkt auf Diktate (F-005) und später Meetings.

## Verhalten

1. Eintrag = `{ id, spoken, correct }`. `correct` Pflicht; `spoken` („Klingt wie“)
   optional — ohne `spoken` dient der Eintrag nur als Hinweis an die Spracherkennung.
2. Liste wie Voitex: `spoken` als Code-Chip → Pfeil → `correct` fett; ohne `spoken`
   nur `correct`.
3. Suche, Sortierung (Korrektes Wort / Klingt wie), Richtung umkehren.
4. „Hinzufügen“ und Klick auf einen Eintrag öffnen einen Dialog (Anlegen/Bearbeiten/
   Löschen). Doppelte `spoken`-Werte (ohne Groß-/Kleinschreibung) werden abgewiesen.
5. Import/Export als CSV `spoken;correct` (UTF-8, Kopfzeile). Import **ergänzt**
   (Duplikate werden übersprungen und gezählt), ersetzt nicht.
6. Speicherung serverseitig in den Einstellungen (F-011), geräteübergreifend.

## Abnahme

- A1 Tests: CSV-Parse/Export (Semikolon, Anführungszeichen, Umlaute), Duplikat-Prüfung,
  Ersetzung im Transkript (ganze Wörter, Groß-/Kleinschreibung egal).
- A2 `pnpm check`, `pnpm test`, `pnpm build` grün.
- A3 Am Effekt: Eintrag anlegen → im nächsten Diktat korrigiert.
