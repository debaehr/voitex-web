# Verifikation — F-013 Eigene Modi

Stand: 27.10.2026 · Lead: Claude Opus 5.5 · Umsetzung: Codex `gpt-6.1-sol` (xhigh, Datenmodell)

- A1–A3: `pnpm check`, `pnpm build` grün; `pnpm test` Backend 151, Frontend 92 grün
  (Commit `b6d990e`). Modell und Aufwand im Codex-Sitzungsprotokoll nachgewiesen.
- Abwärtskompatibilität: `customModes`, `hiddenModes`, `modeLabel` optional, `version` 1;
  Tests für unverändertes Altformat (Settings-Roundtrip, alte Verlaufseinträge).
- Live: Settings mit null verbleibenden Modi → 400; Datensicherung vor Deploy unter
  `~/backup/voitex-web-data-<zeitstempel>/`.
- A4: Live-Abnahme durch den Menschen am 27.10.2026 („Abnahme F-013 ok“).
