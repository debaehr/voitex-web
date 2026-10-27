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
