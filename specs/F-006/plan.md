# Plan Etappe 3 — F-006, F-007

Lead: Claude · Worker: Codex über Happier · 27.10.2026 (v2: Mistral Standard, AssemblyAI Fallback)

Voraussetzung: `MISTRAL_API_KEY` und `ASSEMBLYAI_API_KEY` in `apps/backend/.env`
(Mensch liefert, Lead trägt ein). Läufe nacheinander, testgetrieben, kein Commit durch
den Worker. Aufwand laut MODELLE.md.

| Lauf | Inhalt | Aufwand | Specs |
|---|---|---|---|
| 1 | Backend: Sitzungs-Speicher `data/meetings/<id>/` (atomar), Stück-Upload, Zusammensetzen, Job-Runner mit Wiederaufnahme, Baustein `transcribeMeeting` (Mistral diarize, AssemblyAI Fallback), Protokoll/Zusammenfassung, Token-Grenzen je Aufgabe, `/api/providers.meetings`, Einstellung „Meetings“-Anbieter, `/api/transcribe-meeting` entfernen. | xhigh (Datenmodell) | F-006, F-007 Backend |
| 1b | Lead: Live-Probe mit echten Schlüsseln (kurze Datei, Mistral + AssemblyAI; `language` + `diarize`). | — | F-006 |
| 2 | Frontend Aufnahme: Recorder je Teil, IndexedDB + Upload-Warteschlange, Wiederherstellung, Wake Lock, Unterbrechung/Fortsetzen, Polling. | xhigh | F-006 |
| 3 | Frontend Ergebnis + Upload: Sitzungslisten „Meetings“/„Transkript“, Detail (Protokoll, Transkript, Sprecher umbenennen/zusammenführen, neu erzeugen, Retry, Downloads, Löschen), Datei-Upload in Stücken, Einstellungen-Zeile „Meetings“. | medium | F-006, F-007 |
| 4 | Lead: Review, Deploy, Testaufnahmen PC/Android/iPhone mit dem Menschen, `verification.md`. | — | alle |

## Ergebnis Lauf 1b (Lead, 27.10.2026)

Testdatei: 43-s-Dialog, zwei TTS-Stimmen, Deutsch, WAV 24 kHz mono.

- Mistral direkt: `language=de` **zusammen mit** `diarize=true` akzeptiert; `context_bias`
  mehrfach akzeptiert; `voxtral-mini-transcribe-3` verfügbar; `speaker_id` = `speaker_1`, `speaker_2`;
  Sprecher korrekt getrennt, Fachbegriffe richtig; 1,6 s.
- Ende-zu-Ende über Backend (`POST /api/meetings` → Stück → `finish` → Polling): `done` nach ~5 s,
  Transkript „Sprecher 1/2“, Zusammenfassung (OpenAI gpt-4o-mini), `audioExpiresAt` +24 h.
- AssemblyAI (erzwungen über den Baustein): ok, Modell `universal-2`, Sprecher A/B korrekt, 6 s;
  Fachbegriffe schwächer („Carbonbewä…“).
- Automatischer Fallback (ungültiger Mistral-Schlüssel): Versuch `Mistral: HTTP 401`, dann AssemblyAI ok.
- Schlüssel weder in PM2-Logs noch in `meeting.json`.
- Offen für Lauf 4: echte Browser-Dateien (WebM/Opus aus Chrome/Android, MP4/AAC vom iPhone),
  zusammengesetzte Stücke.

Befunde für Lauf 3:
1. Segmenttexte beginnen mit Leerzeichen („Sprecher 1:  Wir …“) → trimmen.
2. Aufeinanderfolgende Segmente desselben Sprechers als Absatz zusammenfassen (Lesbarkeit).
3. Unterbrechungsmarke formatiert UTC (`slice(11,16)`) → Ortszeit Europe/Berlin.
4. `mergeWithDefaults` übernimmt `providers.meetings` nicht; Einstellungen-Zeile „Meetings“ fehlt.
