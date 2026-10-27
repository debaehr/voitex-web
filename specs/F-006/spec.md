# F-006 — Meetings: Langzeitaufnahme bis 3 h mit Sprecherzuordnung und Protokoll

Status: Entwurf · 27.10.2026 · Freigabe: ausstehend

## Ziel

Eine Besprechung (1–3 h) über das Gerätemikrofon aufnehmen — am Firmen-PC und auf dem
Handy (Android und iPhone) — und daraus ein Transkript mit Sprecherzuordnung und ein
Protokoll erzeugen. Eine Unterbrechung darf die Aufnahme nicht verlieren.
Menüpunkt „Meetings“ (Section-ID `protocol`).

## Anbieter (Entscheidung Mensch 27.10.2026: nur OpenAI)

- Transkription mit Sprechern: `gpt-4o-transcribe-diarize`, `response_format=diarized_json`,
  `chunking_strategy=auto`. **Abgekündigt, Abschaltung 26.02.2027**; der Nachfolger
  `gpt-transcribe` hat laut Doku keine Sprecherzuordnung.
- Deshalb ist der Transkriptionsschritt ein austauschbarer Baustein im Backend
  (`transcribeSegment(audio, options) → { segments: [{speaker, start, end, text}] }`).
  Fallback ohne Sprecher: `gpt-4o-transcribe` bzw. später `gpt-transcribe`
  (alle Abschnitte Sprecher „—“). Umschaltung per Umgebungsvariable
  `MEETING_TRANSCRIBE_MODEL`, Standard = diarize.
- Protokoll: Chat-Modell wie bei den Modi (Anbieter + Prompt „Protokoll“ aus F-011).

## Aufnahme (Browser)

1. **Vor dem Start** Hinweis-Karte: alle Teilnehmenden informieren; Gerät nahe der
   Gesprächsrunde; App geöffnet lassen. Auf iPhone zusätzlich: „Wechsel auf den
   Homescreen oder Sperren hält die Aufnahme an.“ Optional Titel der Sitzung.
2. **Segmente:** Der Recorder wird alle **10 Minuten** neu gestartet (neuer
   `MediaRecorder` auf derselben Spur, alter wird danach gestoppt), damit jedes Segment
   eine eigenständige, gültige Audiodatei < 25 MB ist (OpenAI-Grenze). Opus/WebM bzw.
   AAC/MP4 (iOS), Bitrate 32 kbit/s mono, wo einstellbar.
3. **Laufende Sicherung:** `timeslice` 5 s; jedes Stück wird sofort in IndexedDB
   gespeichert (Sitzung → Segment → Stücke). Ein Absturz/Neuladen verliert höchstens
   ~5 s. Beim nächsten Öffnen: „Nicht abgeschlossene Aufnahme gefunden — fortsetzen /
   jetzt verarbeiten / verwerfen“.
4. **Bildschirm wach:** Screen Wake Lock während der Aufnahme; nach Rückkehr in die
   App erneut anfordern. Ohne Unterstützung: Hinweis.
5. **Unterbrechung erkennen:** Spur endet/stummgeschaltet, `visibilitychange` (iOS)
   oder Recorder-Fehler → Status „Unterbrochen“, deutlicher Hinweis, Knopf
   „Fortsetzen“ startet ein neues Segment derselben Sitzung. Die Lücke wird im
   Transkript als „[Unterbrechung hh:mm–hh:mm]“ markiert.
6. **Anzeige während der Aufnahme:** Laufzeit, Pegel, Segmentzähler, Status der
   Verarbeitung je Segment; Knöpfe Pause/Fortsetzen und Beenden (mit Bestätigung).
   Maximal 3 h 15 min, dann automatischer Stopp mit Hinweis.
7. Diktat-Aufnahme ist während einer Meeting-Aufnahme gesperrt (ein Mikrofon).

## Verarbeitung (segmentweise, schon während der Aufnahme)

- Jedes abgeschlossene Segment wird sofort an `POST /api/meetings/:id/segments`
  hochgeladen und transkribiert (Antwort < 300 s nginx-Timeout, Segment ≤ 10 min).
  Fehlgeschlagene Uploads werden mit Backoff wiederholt (offline-fest); Audio bleibt bis
  zum Erfolg in IndexedDB.
- **Sprecher über Segmente konsistent:** Nach Segment 1 schneidet der Browser je
  erkanntem Sprecher (max. 4) einen 4–10-s-Ausschnitt aus Segment 1 (Web Audio
  `decodeAudioData` → WAV 16 kHz mono, ohne neue Abhängigkeit) und sendet diese als
  `known_speaker_references` mit allen folgenden Segmenten. Mehr als 4 Sprecher oder
  Fehlschlag → Sprecher je Segment, Kennzeichnung im Transkript.
- Nach dem letzten Segment: `POST /api/meetings/:id/protocol` erzeugt das Protokoll aus
  dem Gesamttranskript (Sprechernamen eingesetzt). `max_output_tokens` für Protokolle
  8000, Diktat 4000 (behebt die 1200-Token-Grenze).

## Ergebnis

- Sitzungsliste „Letzte Sitzungen“ mit Titel, Datum, Dauer, Status.
- Detail: Protokoll (Kopieren, Markdown-Download), Transkript mit Sprecher und Zeit
  (Kopieren, TXT-Download), **Sprecher umbenennen** („Sprecher A“ → „Anna“; wirkt auf
  Transkript und neu erzeugtes Protokoll), Protokoll neu erzeugen, Sitzung löschen.
- Gespeichert serverseitig in `data/meetings/<id>.json` (atomar wie history.json):
  Metadaten, Segmente mit Transkript, Sprechernamen, Protokoll. **Audio wird nicht auf
  dem Server gespeichert**; im Browser wird es nach erfolgreicher Verarbeitung gelöscht
  (Option „Audio behalten und herunterladen“ vor dem Löschen).

## Schnittstelle (neu)

- `POST /api/meetings` → `{ id }` (Titel, Startzeit)
- `POST /api/meetings/:id/segments` (multipart: `audio`, `index`, `startOffsetSeconds`,
  optional `speakerReferences` als JSON mit Namen + Data-URL) → Segment-Transkript;
  idempotent je `index`
- `POST /api/meetings/:id/protocol` → Protokoll
- `GET /api/meetings`, `GET /api/meetings/:id`, `PATCH /api/meetings/:id` (Titel,
  Sprechernamen), `DELETE /api/meetings/:id`
- `GET /api/providers`: `meetings: true`, wenn OpenAI-Schlüssel vorhanden.

## Nicht Teil dieses Specs

Echtzeit-Transkript während der Aufnahme, Hintergrundaufnahme bei gesperrtem iPhone
(technisch nicht möglich), Sprecher per Stimmprofil über Sitzungen hinweg,
Übersetzung des Protokolls.

## Offene Fragen

- F1 Audio nach erfolgreicher Verarbeitung im Browser automatisch löschen (Vorschlag)
  oder immer behalten bis zum manuellen Löschen?
- F2 Protokoll automatisch nach dem letzten Segment erzeugen (Vorschlag) oder erst auf
  Knopfdruck?

## Abnahme

- A1 Backend-Tests: Segment-Upload idempotent, Validierung (Größe, Index, Format),
  Modellwahl per Variable, diarized_json → Segmente, Sprecher-Referenzen werden
  weitergegeben, Protokoll mit eingesetzten Namen, atomare Speicherung, Löschen.
- A2 Frontend-Tests: Segment-Rotation (10 min), IndexedDB-Wiederherstellung nach
  Neuladen, Unterbrechung → Fortsetzen mit Lückenmarke, Retry, Referenz-Ausschnitt als
  WAV, Sprecher umbenennen.
- A3 `pnpm check`, `pnpm test`, `pnpm build` grün.
- A4 Am Effekt (Mensch): 15-min-Testaufnahme am PC mit zwei Sprechern; Unterbrechung
  auf Android und iPhone (Homescreen) → Fortsetzen; Seite neu laden während Aufnahme →
  Wiederherstellung; danach eine echte 1–3-h-Sitzung.
