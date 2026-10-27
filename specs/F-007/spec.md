# F-007 — Transkript: Audiodatei hochladen mit Sprecherzuordnung und Zusammenfassung

Status: Entwurf v2 · 27.10.2026 · Freigabe: ausstehend

## Ziel

Eine vorhandene Aufnahme (Handy-Diktiergerät, Teams-Export …) hochladen und wie in
F-006 ein Transkript mit Sprechern und eine Zusammenfassung erhalten.
Menüpunkt „Transkript“ (Section-ID `meetings`).

## Verhalten

- „Datei transkribieren …“: Datei wählen (mp3, m4a, mp4, wav, webm, ogg, flac),
  optional Titel und Sprache. Grenze **200 MB** (nginx); darüber klare Meldung.
- Upload in 5-MB-Stücken über dieselbe Stück-Schnittstelle wie F-006 (ein Teil),
  Fortschrittsbalken, Retry je Stück; danach `finish` → derselbe Server-Job wie F-006
  (Mistral Standard, AssemblyAI Fallback), aber mit Prompt „Zusammenfassung“ statt
  „Protokoll“. Kein Zerlegen im Browser.
- Mistral-Grenze 3 h je Anfrage: längere Dateien gehen direkt an AssemblyAI (bis 10 h);
  die Dauer liefert der Browser beim Auswählen (Audio-Metadaten), sonst Fallback nach
  Mistral-Fehler.
- Ergebnisansicht, Speicherung, Sprecher umbenennen, Löschen, Audio-Löschung: wie F-006
  (`source: "upload"`). „Transkript“ listet hochgeladene, „Meetings“ aufgenommene
  Sitzungen.
- Die heutigen Platzhalter unter „Transkript“ („Einstellungen“, „Zusammenfassungs-Prompt“)
  werden ersetzt: Prompt-Bearbeitung bleibt in den Einstellungen (Verweis), hier nur
  „Name der eigenen Stimme“ (Einstellung `ownSpeakerName`, bereits vorhanden).

## Nicht Teil dieses Specs

Stapel-Upload mehrerer Dateien, Links (Teams/SharePoint), Dateien > 200 MB.

## Abnahme

- A1 Backend: wie F-006 A1 für `source: "upload"`; Dateien > 3 h direkt an AssemblyAI;
  `/api/transcribe-meeting` entfernt.
- A2 Frontend-Tests: Stückweiser Upload mit Fortschritt und Retry, Größen-/Formatprüfung,
  Dauer-Ermittlung, Polling bis `done`.
- A3 `pnpm check`, `pnpm test`, `pnpm build` grün.
- A4 Am Effekt (Mensch): eine kurze Datei und eine ≥ 1-h-Datei hochladen → Transkript
  mit Sprechern und Zusammenfassung.
