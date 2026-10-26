# F-008 — Verlauf mit Suche, Kopieren und Einzellöschung

Status: freigegeben · 26.10.2026 · Freigabe: Mensch, 26.10.2026 (inkl. vitest als devDependency)

## Ziel

Alle Diktate geräteübergreifend wiederfinden, kopieren und einzeln löschen,
im Zwei-Ebenen-Layout (Liste links, Detail rechts; mobil Liste → Detail).

## Verhalten

1. Laden über `GET /api/history`. Ein fehlgeschlagenes Laden ist **kein** leerer
   Verlauf: Hinweis „Verlauf konnte nicht geladen werden“, nichts überschreiben.
2. Liste: Modus als Titel, Datum/Uhrzeit als Badge, Textvorschau (2 Zeilen);
   Sortierung „Neueste zuerst“ (Standard) / „Älteste zuerst“, pro Gerät gemerkt.
3. Suche im Band-Kopf filtert nach Text (Groß-/Kleinschreibung egal).
4. Detail: Modus, Anbieter, Datum, Dauer, Endtext; Knöpfe „Kopieren“ (mit
   Bestätigung „Kopiert“) und „Diesen Eintrag löschen“ (Bestätigungsdialog).
5. „Begriff ins Lexikon“: Eingabe „Richtig geschrieben“ (+ optional „Klingt wie“)
   legt einen Lexikon-Eintrag an (F-009).
6. „Alles löschen“ mit Bestätigungsdialog; „Exportieren“ lädt eine `.txt` mit allen
   Einträgen (Datum, Modus, Text), neueste zuerst.
7. Neue Einträge (F-005) erscheinen sofort oben, ohne Neuladen.

## Backend

- Neu: `DELETE /api/history/:id` (404, wenn unbekannt). Atomares Schreiben und
  Schreib-Lock wie bestehend.
- `POST /api/history` validiert das Format aus F-005 (`id`, `text` Pflicht).

## Abnahme

- A1 Backend-Tests: Einzellöschung, unbekannte ID → 404, parallele POST/DELETE ohne Verlust.
- A2 Frontend-Tests: Filter, Sortierung, Export-Text.
- A3 `pnpm check`, `pnpm test`, `pnpm build` grün.
- A4 Am Effekt: Eintrag auf Gerät A löschen → nach Neuladen auf Gerät B weg.
