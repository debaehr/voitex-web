# Änderung 29.10.2026 — Sprecher von Hand zuordnen, Protokollsprache, Dateinamen, Audio-Frist

Status: freigegeben · Mensch, 29.10.2026. Betrifft F-006 und F-007. Vorentscheidungen des Menschen vom
29.10.2026: Sprecher-Weg a + b; Namensschema für Protokoll und Transkript; auch für Uploads.

## Anlass

- **Sprecher:** In einem Meeting mit drei Personen (zwei davon über Teams und den Jabra) hat Mistral
  einen Kollegen auf zwei Sprecher verteilt und den dritten Teilnehmer in einem davon versteckt. Die
  Sprecherzahl lässt sich Mistral nicht vorgeben, deshalb muss eine Korrektur von Hand möglich sein.
- **Protokollsprache:** Das Protokoll soll wahlweise in einer anderen Sprache als der des Meetings
  entstehen.
- **Dateinamen:** Downloads sollen nach dem Schema `MoM_<YYYY.MM.DD>_<Titel>` heißen.

## 1 · Sprecher von Hand zuordnen (Weg a)

**Transkript:**
- Jeder Absatz (aufeinanderfolgende Segmente eines Sprechers) bekommt eine Sprecherauswahl. Sie zeigt
  die vorhandenen Sprecher (mit Namen, falls vergeben) und „Neuer Sprecher“.
- Die Wahl gilt für den ganzen Absatz.
- „Satzweise zuordnen“ klappt den Absatz in seine Segmente auf; jedes Segment lässt sich einzeln
  umhängen, etwa wenn ein Sprecherwechsel mitten im Absatz liegt.
- „Neuer Sprecher“ legt einen zusätzlichen Sprecher an (`speakerId` z. B. `p1:manual-1`, Anzeige
  „Sprecher n“ mit der nächsten freien Nummer im Teil). Er erscheint sofort in „Sprecher zuordnen“.
- Ein Sprecher ohne Segmente verschwindet aus der Zuordnung; sein Name in `speakerNames` bleibt
  harmlos stehen.
- „Zuordnung zurücksetzen“ stellt die Erkennung des Anbieters wieder her (mit Bestätigung).

**Sprecher zuordnen (Status `naming` und danach):**
- Statt 2–3 bis zu **5 Zitate** je Sprecher, verteilt über die ganze Aufnahme (Anfang, Mitte, Ende),
  nicht nur die ersten. So fällt auf, wenn zwei Personen in einem Sprecher stecken.
- ▶ bleibt je Zitat, solange das Audio vorhanden ist.
- Ein Hinweis unter der Liste: „Stecken zwei Personen in einem Sprecher? Im Transkript Absätze einem
  neuen Sprecher zuweisen.“

**Daten und Schnittstelle:**
- Das rohe Anbieterfeld `segment.speaker` bleibt unverändert. Umgehängt werden `segment.speakerId` und
  `segment.speakerLabel`.
- Zurücksetzen leitet beide wieder aus `part` + `speaker` ab, wie bei der Transkription.
- `PATCH /api/meetings/:id` akzeptiert zusätzlich:
  - `segmentSpeakers: { "<Segmentindex>": "<speakerId>" }` — nur bestehende Indizes; `speakerId` ist
    entweder ein vorhandener Sprecher desselben Teils oder ein neuer `manual-n`-Schlüssel desselben
    Teils;
  - `resetSpeakers: true`.
- Erlaubt in `naming` und `done`, sonst 409. Transkripttext und Absätze werden neu gebildet.
- Nach Änderungen in `done` zeigt die Ansicht „Protokoll neu erzeugen, damit die Zuordnung wirkt“. Es
  gibt keine automatische Neuerzeugung.
- Mehrere Teile: Umhängen nur innerhalb desselben Teils; gleiche Namen führen wie bisher zusammen.
- Bestehende `meeting.json` bleiben gültig (keine Migration nötig).

## 1b · Größeres Mistral-Modell (Weg b, Lead)

- Der Lead prüft `voxtral-small-transcribe-3` gegen `voxtral-mini-transcribe-3` mit dem Audio des
  betroffenen Meetings (falls noch vorhanden) oder einer Ersatzaufnahme.
- Die Prüfung läuft direkt gegen die API, ohne die Live-Einstellung zu ändern.
- Ist das größere Modell klar besser, entscheidet der Mensch über die Umstellung per
  `MISTRAL_MEETING_MODEL`. Kein Code nötig.

## 2 · Protokollsprache

- Neben „Protokoll erstellen“, „Ohne Namen erstellen“ und „Protokoll neu erzeugen“ steht eine Auswahl
  „Protokollsprache“. Standard ist „Wie im Meeting“; dazu kommen die Sprachen aus
  `apps/frontend/src/lib/languages.ts` ohne „automatisch“.
- Die letzte Wahl merkt sich das Gerät (`localStorage`, mit try/catch).
- `POST /api/meetings/:id/protocol` akzeptiert zusätzlich `protocolLanguage` (Sprachcode wie bei
  `language` oder fehlend = wie im Meeting).
- Gespeichert wird `meeting.protocolLanguage`; die Detailansicht nennt die Sprache neben dem Anbieter.
- Prompt-Zusatz bei abweichender Sprache: Das gesamte Protokoll bzw. die Zusammenfassung wird in der
  Zielsprache geschrieben (Sprachname über `Intl.DisplayNames`). Zitate werden übersetzt. Namen,
  Firmen- und Produktnamen sowie Lexikon-Begriffe bleiben unverändert.
- Gilt gleichermaßen für Meetings (Protokoll) und Uploads (Zusammenfassung).
- Das Transkript bleibt in der Originalsprache.

## 3 · Dateinamen

- Protokoll: `MoM_<YYYY.MM.DD>_<Titel>.md`.
- Transkript: `MoM_<YYYY.MM.DD>_<Titel>_Transkript.txt`.
- Gilt für Meetings und Uploads.
- Datum: Tag der Aufnahme bzw. des Uploads (`createdAt`) in der Zeitzone Europe/Berlin.
- Titel:
  - wie eingegeben;
  - entfernt werden nur `\ / : * ? " < > |` und Steuerzeichen;
  - Leerzeichen bleiben, mehrfache werden zu einem;
  - führende und abschließende Leerzeichen und Punkte werden entfernt;
  - höchstens 120 Zeichen.
- Ohne Titel: `MoM_2026.10.29.md` bzw. `MoM_2026.10.29_Transkript.txt`.
- Eine Hilfsfunktion `meetingFileName(meeting, kind)` im Frontend; die Audio-Downloads bleiben
  unverändert.

## 4 · Audio eine Woche aufbewahren

- `AUDIO_RETENTION_MS` wird von 24 h auf **7 Tage** erhöht. Ersetzt die 24-h-Regel aus F-006 F1.
  Mensch, 29.10.2026.
- Beim Start erhalten Sitzungen, deren Audio noch vorhanden ist, `audioExpiresAt = max(bisher,
  transcribedAt + 7 Tage)`. Bereits gelöschtes Audio bleibt gelöscht.
- Die Anzeige „wird am … gelöscht“ und „Jetzt löschen“ bleiben unverändert.
- Lead am 29.10. vorab: `audioExpiresAt` von BAU2027 von Hand auf +7 Tage gesetzt (Sicherung unter
  `~/backup/voitex-web-meeting-*`).

## Nicht Teil dieser Änderung

- Vorgabe der Sprecherzahl an Mistral (API kennt das nicht).
- AssemblyAI mit fester Sprecherzahl (Weg c, verworfen wegen Datenschutz).
- Übersetzung des Transkripts.

## Abnahme

- A1 Backend-Tests:
  - `segmentSpeakers` mit vorhandenem und neuem Sprecher;
  - ungültiger Index, fremder Teil und falscher Status werden abgelehnt;
  - `resetSpeakers` stellt den Ausgangszustand her;
  - Transkripttext und Protokoll-Prompt nutzen die neue Zuordnung;
  - `protocolLanguage` landet im Prompt und in `meeting.json`;
  - ohne `protocolLanguage` bleibt der Prompt unverändert;
  - alte `meeting.json` werden geladen;
  - Audio-Frist 7 Tage, Verlängerung beim Start nur bei noch vorhandenem Audio.
- A2 Frontend-Tests:
  - Absatz umhängen, satzweise umhängen, neuer Sprecher erscheint in der Zuordnung;
  - Zitate verteilt über die Aufnahme, höchstens 5;
  - Sprachauswahl wird gesendet und gemerkt;
  - `meetingFileName` mit Sonderzeichen, ohne Titel, Datum an der Tagesgrenze (Berliner Zeit).
- A3 `pnpm check`, `pnpm test`, `pnpm build` grün.
- A4 Am Effekt (Mensch):
  - das Drei-Personen-Meeting von Hand korrigieren und das Protokoll mit drei Namen erzeugen;
  - ein Protokoll auf Englisch aus einem deutschen Meeting;
  - Dateinamen im Download-Ordner prüfen.
