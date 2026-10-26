# F-010 — Snippets

Status: freigegeben · 26.10.2026 · Freigabe: Mensch, 26.10.2026 (inkl. vitest als devDependency)

## Ziel

Textbausteine per Schlüsselwort diktieren (Voitex-Seite „Snippets“).

## Verhalten

1. Snippet = `{ id, trigger, text }`. Beide Pflicht.
2. Treffer nur, wenn das **ganze** Diktat dem Schlüsselwort entspricht (Groß-/Klein-
   schreibung, Leerzeichen und Satzzeichen am Rand egal). Dann wird `text`
   unverändert Ergebnis, ohne Umschreiben (F-005).
3. Liste mit Suche, Sortierung, leerer Zustand wie Voitex; Dialog zum Anlegen/
   Bearbeiten/Löschen; doppelte Schlüsselwörter werden abgewiesen.
4. Import/Export als JSON-Datei (Liste von `{ trigger, text }`); Import ergänzt.
5. Speicherung serverseitig in den Einstellungen (F-011).

## Abnahme

- A1 Tests: Trigger-Normalisierung, kein Treffer bei Teilsatz, Duplikat-Prüfung, Import.
- A2 `pnpm check`, `pnpm test`, `pnpm build` grün.
- A3 Am Effekt: Schlüsselwort diktieren → Snippet-Text in der Zwischenablage.
