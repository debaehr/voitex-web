# F-007 — Transkript: Audiodatei hochladen mit Sprecherzuordnung und Zusammenfassung

Status: Entwurf · 27.10.2026 · Freigabe: ausstehend

## Ziel

Eine vorhandene Aufnahme (z. B. vom Handy-Diktiergerät oder aus Teams) hochladen und
wie in F-006 Transkript mit Sprechern und Zusammenfassung erhalten.
Menüpunkt „Transkript“ (Section-ID `meetings`).

## Verhalten

- „Datei transkribieren …“ wählt eine Datei (mp3, m4a, mp4, wav, webm, ogg). Optional Titel.
- **Bis 25 MB:** direkt als ein Segment an dieselbe Segment-Schnittstelle wie F-006.
- **Über 25 MB:** Der Browser zerlegt die Datei in Teile ≤ 10 min:
  Decodieren mit Web Audio (`OfflineAudioContext`, 16 kHz mono) und Kodieren als WAV
  16 bit (10 min ≈ 19 MB < 25 MB), ohne neue Abhängigkeit. Speicherbedarf ~230 MB je
  Stunde Audio → **am PC bis 3 h**, auf dem Handy Warnung ab 60 min. Schlägt das
  Decodieren fehl (Format/Speicher): klare Meldung mit Tipp („als MP3 exportieren“).
- Danach identisch zu F-006: Segmente nacheinander hochladen (Fortschritt „Teil 3/12“),
  Sprecher-Referenzen aus Teil 1, Retry, Zusammenfassung am Ende.
- Datei und Teile werden nur im Browser gehalten; nach Erfolg verworfen.
- Ergebnisansicht, Speicherung, Sprecher umbenennen, Löschen: wie F-006 (gleiche
  Sitzungsdaten, `source: "upload"` statt `"recording"`). Die Liste unter „Transkript“
  zeigt hochgeladene Sitzungen; „Meetings“ zeigt aufgenommene.
- Zusammenfassung nutzt den Prompt „Zusammenfassung“ (F-011); die heutige
  Platzhalter-Seite „Zusammenfassungs-Prompt“ und „Einstellungen“ unter Transkript
  wird durch die echten Einstellungen ersetzt (Prompt-Bearbeitung bleibt in den
  Einstellungen; hier nur Verweis + Name der eigenen Stimme).
- Der alte synchrone Endpunkt `/api/transcribe-meeting` (AssemblyAI) entfällt.

## Nicht Teil dieses Specs

Video-Dateien > 25 MB mit Bildspur (nur Tonspur wird decodiert, falls möglich),
Stapel-Upload mehrerer Dateien, Links (Teams/SharePoint).

## Abnahme

- A1 Backend: wie F-006 A1 für `source: "upload"`; `/api/transcribe-meeting` entfernt.
- A2 Frontend-Tests: Aufteilen in ≤ 10-min-WAV-Teile (Länge, Header, Größe < 25 MB),
  kleine Datei ohne Aufteilen, Fehlermeldung bei nicht decodierbarer Datei, Fortschritt.
- A3 `pnpm check`, `pnpm test`, `pnpm build` grün.
- A4 Am Effekt (Mensch): eine 10-MB-Datei und eine > 25-MB-Datei (≥ 1 h) am PC
  hochladen → Transkript mit Sprechern und Zusammenfassung.
