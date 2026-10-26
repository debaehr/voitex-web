# Plan Etappe 2 — F-005, F-008, F-009, F-010, F-011

Lead: Claude · Worker: Codex über Happier, `medium` · 26.10.2026

Läufe nacheinander (gleiche Dateien), jeder testgetrieben, kein Commit durch den Worker.

| Lauf | Inhalt | Specs |
|---|---|---|
| 1 | Testgerüst (`vitest`, `pnpm test` in beiden Workspaces), Abschnitt „Wichtige Befehle“ in `AGENTS.md`; Backend: Frontend ausliefern + SPA-Fallback, 200 MB, `GET /api/providers`, `language=auto`, `DELETE /api/history/:id`, Validierung `POST /api/history`, `GET /api/settings/defaults`, Validierung `PUT /api/settings`. Backend so umbauen, dass die Express-App ohne `listen` testbar ist (`createApp()`). | F-005 V1–V4, F-008 Backend, F-011 Backend |
| 2 | Frontend-Datenschicht: Typen, API-Client, Settings-Laden/-Speichern mit Defaults und Dirty-Erkennung; Seiten Einstellungen, Lexikon (Dialog, CSV), Snippets (Dialog, JSON). | F-011, F-009, F-010 |
| 3 | Diktat (Recorder-Hook, Pegel, Pipeline Transkription → Lexikon → Snippet/LLM, Zwischenablage, Karte, Verlauf-POST) und Verlauf-Seite (Suche, Sortierung, Detail, Löschen, Export, Begriff ins Lexikon). | F-005, F-008 |
| 4 | Lead: Review, PM2-Prozess `voitex-web` (torsten), Abnahme auf `https://voitex.pmsuite.eu`, `verification.md`. | alle |
