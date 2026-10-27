# Plan Etappe 3 — F-006, F-007

Lead: Claude · Worker: Codex über Happier · 27.10.2026

Läufe nacheinander, testgetrieben, kein Commit durch den Worker. Aufwand laut MODELLE.md.

| Lauf | Inhalt | Aufwand | Specs |
|---|---|---|---|
| 1 | Backend: Sitzungs-Speicher `data/meetings/` (atomar), Endpunkte, Segment-Transkription als austauschbarer Baustein (diarize + Fallback, Sprecher-Referenzen), Protokoll/Zusammenfassung, `max_output_tokens` je Aufgabe (Diktat 4000, Protokoll 8000), `/api/providers.meetings`, `/api/transcribe-meeting` entfernen. | xhigh (Datenmodell) | F-006, F-007 Backend |
| 2 | Frontend Aufnahme: segmentierter Recorder (10 min), IndexedDB-Sicherung + Wiederherstellung, Wake Lock, Unterbrechung/Fortsetzen, Upload-Warteschlange mit Retry, WAV-Ausschnitte für Sprecher-Referenzen. | xhigh | F-006 |
| 3 | Frontend Ergebnis + Upload: Sitzungslisten unter „Meetings“ und „Transkript“, Detail (Protokoll, Transkript, Sprecher umbenennen, neu erzeugen, Downloads, Löschen), Datei-Upload mit Aufteilung in WAV-Teile. | medium | F-006, F-007 |
| 4 | Lead: Review, Deploy, Testaufnahmen PC/Android/iPhone mit dem Menschen, `verification.md`. | — | alle |
