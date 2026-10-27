# F-006 — Meetings: Langzeitaufnahme bis 3 h mit Sprecherzuordnung und Protokoll

Status: freigegeben · 27.10.2026 · Freigabe: Mensch, 27.10.2026 (F1: Audio automatisch löschen nach Download-Angebot; F2: Protokoll automatisch) · v3 freigegeben 27.10.2026 (Sprecher zuordnen vor dem Protokoll; ersetzt F2)

## Ziel

Eine Besprechung (1–3 h) über das Gerätemikrofon aufnehmen — am Firmen-PC und auf dem
Handy (Android und iPhone) — und daraus ein Transkript mit Sprecherzuordnung und ein
Protokoll erzeugen. Eine Unterbrechung oder ein Absturz darf die Aufnahme nicht
verlieren. Menüpunkt „Meetings“ (Section-ID `protocol`).

## Anbieter (Entscheidung Mensch 27.10.2026)

- **Standard: Mistral Voxtral** — `POST https://api.mistral.ai/v1/audio/transcriptions`,
  Modell `voxtral-mini-transcribe-3` (Modell-ID per Umgebungsvariable
  `MISTRAL_MEETING_MODEL` änderbar, z. B. `voxtral-small-transcribe-3`, derzeit Preview),
  `diarize=true`, `timestamp_granularities=segment`, `context_bias` = korrekte
  Lexikon-Begriffe (F-009). Laut Doku bis 3 h je Anfrage, Dateien bis 500 MB.
  Antwort: `segments[]` mit `text`, `start`, `end`, `speaker_id`.
- **Fallback: AssemblyAI** — Upload + `POST /v2/transcript` mit `speaker_labels: true`,
  Polling (bis 10 h je Datei). Greift automatisch, wenn Mistral fehlschlägt oder kein
  Mistral-Schlüssel gesetzt ist; das Ergebnis nennt den genutzten Anbieter.
- Beide hinter einem Baustein im Backend:
  `transcribeMeeting(file, options) → { provider, model, segments: [{speaker, start, end, text}] }`.
  Sprecher-IDs werden einheitlich auf „Sprecher 1, 2, …“ abgebildet.
- Einstellungen → Anbieter: neue Zeile „Meetings“ (Mistral | AssemblyAI), Standard
  Mistral; nicht verfügbare Anbieter „(kein Schlüssel)“.
- Sprache: Aufnahmesprache aus dem Overlay (Standard DE) wird mitgegeben; ob Mistral
  `language` zusammen mit `diarize` akzeptiert, wird in Lauf 1 live geprüft — sonst
  automatische Erkennung.
- Protokoll: Chat-Modell laut Einstellung „Protokoll“ (F-011).

## Aufnahme (Browser)

1. **Vor dem Start** Hinweis-Karte: alle Teilnehmenden informieren; Gerät nahe der
   Gesprächsrunde; App geöffnet lassen. Auf dem iPhone zusätzlich: „Wechsel auf den
   Homescreen oder Sperren hält die Aufnahme an.“ Optional Titel.
2. Ein `MediaRecorder` je **Teil** (ein Teil = Aufnahme ohne Unterbrechung), Opus/WebM
   bzw. AAC/MP4 (iOS), 32 kbit/s mono wo einstellbar (3 h ≈ 45 MB). `timeslice` 5 s.
3. **Doppelte Sicherung jedes 5-s-Stücks:** sofort in IndexedDB **und** fortlaufend an
   den Server (`PUT /api/meetings/:id/parts/:part/chunks/:n`, idempotent, Retry mit
   Backoff, offline-fest). Absturz/Neuladen verliert höchstens ~5 s. Beim nächsten
   Öffnen: „Nicht abgeschlossene Aufnahme — fortsetzen / jetzt verarbeiten / verwerfen“;
   fehlende Stücke werden aus IndexedDB nachgeliefert.
4. **Bildschirm wach** (Screen Wake Lock), nach Rückkehr erneut anfordern; ohne
   Unterstützung Hinweis.
5. **Unterbrechung erkennen** (Spur endet/stumm, `visibilitychange`, Recorder-Fehler) →
   Status „Unterbrochen“, deutlicher Hinweis, „Fortsetzen“ startet einen neuen Teil.
   Lücke im Transkript: „[Unterbrechung hh:mm–hh:mm]“.
6. Anzeige: Laufzeit, Pegel, Upload-Stand („gesichert bis hh:mm:ss“); Knöpfe
   Pause/Fortsetzen, Beenden (mit Bestätigung). Maximal 3 h, dann automatischer Stopp.
7. Diktat ist während einer Meeting-Aufnahme gesperrt (ein Mikrofon).

## Verarbeitung (asynchron auf dem Server)

- „Beenden“ → `POST /api/meetings/:id/finish`. Der Server setzt die Stücke je Teil zu
  einer Datei zusammen (Stücke eines Recorders ergeben eine gültige Datei) und startet
  einen **Job**: Transkription je Teil → Protokoll. Status in der Sitzungsdatei
  (`queued | transcribing | summarizing | done | error`), Browser fragt alle 5 s ab.
  Keine lange HTTP-Anfrage durch nginx (300-s-Grenze).
- Jobs überstehen einen PM2-Neustart: beim Start werden nicht abgeschlossene Jobs neu
  aufgenommen (Audio liegt noch vor).
- Mehrere Teile (nach Unterbrechung) werden einzeln transkribiert; Sprecher gelten je
  Teil („Teil 2 · Sprecher 1“) und lassen sich beim Umbenennen zusammenführen.
- Fehler → Status `error` mit Grund, Knopf „Erneut versuchen“ (wahlweise mit dem
  anderen Anbieter).
- `max_output_tokens`/`max_tokens` je Aufgabe: Diktat 4000, Protokoll/Zusammenfassung
  8000 (behebt die 1200-Token-Grenze für alle Chat-Anbieter).

## Ergebnis

- Liste „Letzte Sitzungen“ mit Titel, Datum, Dauer, Status/Fortschritt.
- Detail: Protokoll (Kopieren, Markdown-Download), Transkript mit Sprecher und Zeit
  (Kopieren, TXT-Download), **Sprecher umbenennen/zusammenführen** („Sprecher 1“ →
  „Anna“; wirkt auf Transkript und neu erzeugtes Protokoll), Protokoll neu erzeugen,
  Sitzung löschen. Eigener Name aus „Name der eigenen Stimme“ als Vorschlag.
- Gespeichert in `data/meetings/<id>/meeting.json` (atomar wie history.json):
  Metadaten, Teile, Segmente, Sprechernamen, Protokoll, Anbieter.
- **Audio** liegt nur bis zum erfolgreichen Abschluss temporär unter
  `data/meetings/<id>/audio/` und wird dann gelöscht (→ F1); im Browser wird die
  IndexedDB-Kopie nach Abschluss gelöscht.

## Schnittstelle (neu)

- `POST /api/meetings` `{ title?, source: "recording"|"upload", language }` → `{ id }`
- `PUT /api/meetings/:id/parts/:part/chunks/:n` (Binärkörper ≤ 10 MB, idempotent)
- `POST /api/meetings/:id/finish` → startet Job
- `POST /api/meetings/:id/retry` `{ provider? }`, `POST /api/meetings/:id/protocol` (neu erzeugen)
- `GET /api/meetings`, `GET /api/meetings/:id`, `PATCH /api/meetings/:id`
  (Titel, Sprechernamen), `DELETE /api/meetings/:id` (inkl. Audio)
- `GET /api/providers`: `meetings: ["mistral","assemblyai"]` (die mit Schlüssel).
- Alt: `/api/transcribe-meeting` entfällt.

## Nicht Teil dieses Specs

Echtzeit-Transkript während der Aufnahme, Aufnahme bei gesperrtem iPhone (technisch
nicht möglich), Sprecher-Wiedererkennung über Sitzungen, Übersetzung des Protokolls.

## Entschiedene Fragen

- F1 Audio wird nach erfolgreicher Verarbeitung automatisch gelöscht; vorher bietet die
  Ergebnisansicht „Audio herunterladen“ an (Server-Kopie bis zur Löschung abrufbar,
  `GET /api/meetings/:id/audio`, je Teil). Mensch, 27.10.2026.
  Umsetzung: Audio bleibt nach `done` noch **24 h** erhalten; die Ergebnisansicht zeigt
  „Audio herunterladen (wird am … gelöscht)“ und „Jetzt löschen“. Danach löscht der
  Server es automatisch (Prüfung beim Start und stündlich).
- F2 ~~Protokoll automatisch~~ — ersetzt durch v3 (Sprecher zuordnen, dann „Protokoll erstellen“). Mensch, 27.10.2026.

## Abnahme

- A1 Backend-Tests (Anbieter gemockt): Stück-Upload idempotent und Reihenfolge-fest,
  Zusammensetzen je Teil, Job-Statusfolge, Fallback Mistral → AssemblyAI, Abbildung
  `speaker_id`/`speaker` → „Sprecher n“, `context_bias` aus Lexikon, Wiederaufnahme
  nach Neustart, Protokoll mit eingesetzten Namen, Token-Grenzen je Aufgabe, Löschen
  inkl. Audio, keine Schlüssel in Antworten.
- A2 Frontend-Tests: Stücke in IndexedDB + Upload-Warteschlange mit Retry,
  Wiederherstellung nach Neuladen, Unterbrechung → neuer Teil mit Lückenmarke,
  Polling, Sprecher umbenennen/zusammenführen.
- A3 `pnpm check`, `pnpm test`, `pnpm build` grün.
- A4 Am Effekt (Mensch): 15-min-Testaufnahme am PC mit zwei Sprechern (Mistral);
  Fallback-Probe mit AssemblyAI; Unterbrechung auf Android und iPhone → Fortsetzen;
  Neuladen während der Aufnahme → Wiederherstellung; danach eine echte 1–3-h-Sitzung.

## Änderung v3 (freigegeben, Mensch 27.10.2026) — Sprechernamen vor dem Protokoll

Ersetzt F2 („Protokoll automatisch“). V2T-Vorbild: Sprecherfelder nach dem Transkript.

- **Vor dem Start / Upload** optional „Teilnehmende“ (Namen, durch Komma getrennt), gespeichert
  in der Sitzung als `participants`. Sie wirken dreifach:
  1. als zusätzliche `context_bias`-Begriffe, damit Namen richtig geschrieben werden;
  2. als Vorschlagsliste in den Namensfeldern;
  3. als Teilnehmerliste im Protokoll-Prompt.
- **Nach der Transkription** neuer Status `naming` („Sprecher zuordnen“) statt direkt
  `summarizing`. Je erkanntem Sprecher eine Zeile mit:
  - 2–3 kurzen Zitaten als Erkennungshilfe;
  - ▶-Knopf, der das Audio ab dem ersten Zitat abspielt (solange das Audio vorhanden ist);
  - Eingabefeld für den Namen, mit den Teilnehmenden zur Auswahl und dem eigenen Namen als Vorschlag.

  Knöpfe „Protokoll erstellen“ (speichert `speakerNames`, startet den Protokoll-Job) und
  „Ohne Namen erstellen“. Das Transkript ist sofort sichtbar.
- Mehrere Teile: Zeilen je „Teil n · Sprecher m“; gleiche Namen führen Sprecher zusammen.
- Namen bleiben danach änderbar; „Protokoll neu erzeugen“ wie bisher.
- **Lexikon im Transkript:**
  - die korrekten Begriffe gehen schon heute als `context_bias` an Mistral (Probe 1b);
  - neu: die Ersetzungsregeln des Lexikons (falsch → richtig) wirken nach der Transkription
    auf die Segmenttexte, wie beim Diktat;
  - AssemblyAI bekommt die Begriffe als Schlüsselwörter, falls das Modell es unterstützt
    (bei der Umsetzung prüfen, sonst entfällt das).
- Sprecherzahl oder Stimmen lassen sich Mistral nicht vorgeben; die API kennt nur `context_bias`.
  Die Zuordnung Sprecher → Name bleibt deshalb ein Schritt nach der Transkription.
