# F-014 — Mistral als Standard-Anbieter (Datenschutz)

Status: freigegeben · 27.10.2026 · Freigabe: Mensch, 27.10.2026 (AssemblyAI-Ausweiche standardmäßig aus)

## Ziel

Für den Firmeneinsatz laufen alle Aufgaben standardmäßig über Mistral (EU-Anbieter).
OpenAI und AssemblyAI bleiben wählbar.

## Verhalten

- Standard-Anbieter (`/api/settings/defaults`, Frontend-Rückfallwerte) für alle
  Aufgaben `mistral`: Diktat-Modi original/casual/formal/coding, Protokoll,
  Zusammenfassung, Meetings. Neue eigene Modi (F-013) bekommen ebenfalls `mistral`.
- Rückfallwerte im Code (`?? "openai"`, `|| "openai"` in `meetings.ts`, `routes/api.ts`,
  `lib/modes.ts`) werden auf `mistral` umgestellt.
- **Bestehende `settings.json` wird einmalig umgestellt**: alle Einträge in `providers`
  und alle `customModes[].provider` auf `mistral`. Davor Sicherung nach
  `~/backup/voitex-web-data-<zeitstempel>/`. Die Lead-Rolle führt das per
  `PUT /api/settings` aus (kein Migrationscode).
- Diktat mit Mistral: Transkription `voxtral-mini-latest` bekommt die korrekten
  Lexikon-Begriffe als `context_bias` (wie bei Meetings). Wenn Mistral `context_bias` beim Diktat
  ablehnt (Live-Probe), entfällt der Punkt.
- Meeting-Fallback AssemblyAI bleibt bestehen. Er greift nur bei einem Fehler von Mistral
  und ist in den Einstellungen abschaltbar: „Bei Fehler auf AssemblyAI ausweichen“, Standard **aus**,
  weil sonst Firmenaudio ohne Zutun an einen US-Anbieter ginge. Bei „aus“ endet ein
  Mistral-Fehler im Status `error` mit „Erneut versuchen“ (wahlweise AssemblyAI).

## Abnahme

- A1 Backend-Tests: Defaults alle `mistral`; kein stiller Rückfall auf OpenAI; Fallback nur
  bei aktivierter Einstellung; `context_bias` beim Diktat.
- A2 Frontend-Tests: neuer eigener Modus → `mistral`; Einstellung Fallback speichern.
- A3 `pnpm check`, `pnpm test`, `pnpm build` grün.
- A4 Am Effekt: Einstellungen zeigen überall Mistral; Diktat und Testsitzung melden „Mistral“.
