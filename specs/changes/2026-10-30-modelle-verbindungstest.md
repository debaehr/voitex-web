# Änderung 30.10.2026 — Anbieter und Modelle, Ausweiche fürs Diktat, Verbindungstest, einklappbares Menü

Status: freigegeben · Mensch, 30.10.2026. Betrifft F-001 (App-Rahmen), F-005 (Diktat), F-006/F-007,
F-011 (Einstellungen), F-014, F-015.
Entwurf der Oberfläche, vom Menschen am 30.10.2026 bestätigt: https://claude.ai/artifact/WcAf6heVhwuvfKLveBZYEb
(privat).

## Anlass

Die Karte „Anbieter je Modus“ zeigt nur Anbieter, nicht das Modell, und vermischt Diktat und Meetings.
Gewünscht:
- je Aufgabe Anbieter **und** Modell frei wählbar;
- eine Ausweiche für die Diktat-Spracherkennung (z. B. OpenAI);
- eine verständliche Gliederung;
- ein Verbindungstest;
- ein einklappbares Hauptmenü, weil die Einstellungen im halb breiten Browserfenster zu eng sind.

## 1 · Karte „Anbieter und Modelle“ (ersetzt „Anbieter je Modus“)

Der Eintrag in der Einstellungsliste heißt „Anbieter und Modelle“. Jede Zeile hat: Bezeichnung |
Anbieter-Auswahl | Modell-Auswahl | Statusfeld (leer, ✓ oder ⚠ nach dem Test).

**Diktat**
- **Spracherkennung**
  - Gilt für alle Diktat-Modi gemeinsam.
  - Anbieter: Mistral oder OpenAI, nur Anbieter mit Schlüssel.
  - Neu und eigenständig. Heute folgt sie dem Anbieter des jeweiligen Modus.
- **Ausweiche bei Fehler**
  - Wahl zwischen „Keine“ und einer anderen Kombination aus Anbieter und Modell der Spracherkennung,
    z. B. OpenAI · gpt-4o-mini-transcribe, gpt-4o-transcribe oder whisper-1.
  - Ist ein Anbieter in den USA gewählt, erscheint der Hinweis: „Bei Ausweiche geht das Audio an einen
    US-Anbieter.“
- **Nachbearbeitung je Modus**
  - Eine Zeile je Modus: Original, Casual, Formal, Coding und eigene Modi.
  - Anbieter: Mistral, OpenAI oder Claude, jeweils mit eigenem Textmodell.

**Meetings und Transkript-Upload**
- **Spracherkennung mit Sprechertrennung:** Mistral oder AssemblyAI, mit Modell.
- **Ausweiche bei Fehler:** „Keine“ oder AssemblyAI mit Modell, samt US-Hinweis. Ersetzt den Schalter
  `meetingFallback`.
- **Protokoll (aufgenommene Meetings)** und **Zusammenfassung (hochgeladene Dateien):** Anbieter und
  Textmodell.

**Auswahl der Anbieter:** Es erscheinen nur Anbieter mit Schlüssel. Ungültige Schlüssel werden wie
bisher markiert.

**Auswahl der Modelle:**
- Die Liste hängt vom Anbieter und von der Aufgabe ab (siehe 3).
- Ein gespeichertes Modell, das nicht mehr in der Liste steht, bleibt als Eintrag „(nicht mehr
  angeboten)“ sichtbar, bis es geändert wird.

**Anordnung:**
- Die Karte richtet sich nach ihrem eigenen Platz (Container-Query), nicht nach der Fensterbreite.
- Ist sie schmaler als etwa 560 px, steht die Bezeichnung über der Zeile; Anbieter, Modell und Status
  bleiben nebeneinander.
- Auf dem Handy gilt dieselbe Regel.
- Zum Speichern dient wie bisher „Einstellungen speichern“.

## 2 · Verhalten

**Diktat-Spracherkennung**
- Sie nutzt die gewählte Kombination aus Anbieter und Modell.
- Lexikon-Begriffe:
  - Mistral bekommt sie als `context_bias`, wie bisher.
  - OpenAI bekommt sie als `prompt`, wie bisher.
- **Ausweiche:**
  - Sie greift bei Netzwerkfehler, Zeitüberschreitung, HTTP 429 oder 5xx und bei 401/403
    (ungültiger Schlüssel).
  - Sie greift **nicht**, wenn das Audio abgelehnt wird (400/413/415). Ein Wechsel hilft dort nicht.
  - Der Verlaufseintrag nennt den tatsächlich genutzten Anbieter und das Modell.
- Die Frage, ob die Ausweiche im Backend oder im Frontend sitzt, entscheidet der Worker. Bevorzugt ist
  das Backend: `POST /api/transcribe` nimmt die Ausweiche entgegen oder liest sie aus den Einstellungen.

**Nachbearbeitung, Protokoll, Zusammenfassung, Übersetzen**
- Diese Aufgaben nutzen das gewählte Textmodell des Anbieters.
- Die OpenAI-Aufrufe müssen mit allen angebotenen Textmodellen funktionieren. Beispiel: Modelle, die
  Parameter wie `temperature` ablehnen. Angeboten werden nur Modellfamilien, die der Code sicher
  bedienen kann.

**Meetings**
- Spracherkennung und Ausweiche nutzen die gewählten Modelle.
- Mistral-Meetings brauchen ein Modell mit Sprechertrennung (`*-transcribe-*`). Die Liste zeigt nur
  solche.

**Zuordnung des Übersetzens:** Es nutzt den Anbieter und das Modell der Nachbearbeitung des aktiven
Modus, wie heute der Anbieter.

## 3 · Modelllisten und Einstellungen

**Modelllisten vom Server**
- `GET /api/providers` liefert zusätzlich `models[provider][task]`, mit `task` ∈ `stt | chat | meetings`.
- Jeder Eintrag hat `{ id, default?: true }`.
- **Quelle:** die Modell-Liste des Anbieters (`/v1/models`). Sie wird mit der Schlüsselprüfung beim
  Start und alle 6 h geholt und nach Aufgabe gefiltert:
  - **Mistral:**
    - `chat`: Modelle mit Chat-Fähigkeit, ohne Embedding-, OCR-, Moderations- und Audio-Modelle;
    - `stt`: Voxtral-Transkriptionsmodelle;
    - `meetings`: `*-transcribe-*`.
  - **OpenAI:**
    - `stt`: `whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe` und Nachfolger mit
      `-transcribe`;
    - `chat`: nur Familien, die der Code sicher bedient; keine Audio-, Realtime-, TTS-, Bild-, Such-
      oder Embedding-Modelle.
  - **Anthropic:** `chat` = alle `claude-*`.
  - **AssemblyAI:** feste Liste (`universal-3-5-pro`, `universal-2`), weil der Anbieter keine
    Modell-Liste bietet.
- **Fallback:** Gelingt der Abruf nicht, gilt eine feste Vorschlagsliste je Anbieter und Aufgabe. Sie
  enthält mindestens die heutigen Standardmodelle.
- Das heutige Standardmodell ist immer enthalten und markiert (`default`).
- Die Umgebungsvariablen (`MISTRAL_MEETING_MODEL`, `ANTHROPIC_CHAT_MODEL`, `ASSEMBLYAI_MEETING_MODEL`)
  bestimmen weiterhin das Standardmodell.

**Einstellungen (`settings.json`, abwärtskompatibel)**
- Neue Felder:
  - Modell je Zeile;
  - Diktat-Spracherkennung mit Anbieter und Modell;
  - Diktat-Ausweiche (oder keine);
  - Meeting-Spracherkennung mit Anbieter und Modell;
  - Meeting-Ausweiche (oder keine).
- Die genaue Form legt der Worker fest. Vorgaben:
  - Bestehende Felder (`providers`, `meetingFallback`) bleiben lesbar.
  - Fehlende neue Felder werden so abgeleitet, dass sich das Verhalten **nicht** ändert:
    - Diktat-Spracherkennung = heutige Regel, also Anbieter des Modus „Original“ bzw. die
      `dictationSttProvider`-Regel, mit dem heutigen Modell;
    - Diktat-Ausweiche = keine;
    - Meeting-Ausweiche = AssemblyAI, wenn `meetingFallback === true`, sonst keine;
    - Modelle = heutige Standards.
  - Validierung im Backend: Anbieter bekannt; Modell-ID als sicherer String, höchstens 100 Zeichen,
    Muster `[A-Za-z0-9._:-]`. Ein Modell muss nicht in der aktuellen Liste stehen, weil Listen sich
    ändern. Der Aufruf meldet dann den Fehler des Anbieters in sicherer Form.
- Der Anbieter `groq` bleibt unverändert (ohne Schlüssel ausgeblendet).

## 4 · Verbindungstest

- **Knopf:** Am Ende der Karte steht der Knopf „Verbindung prüfen“. Er ist während der Prüfung gesperrt
  und zeigt „Prüfe …“.
- **Was geprüft wird:** alle Kombinationen aus Anbieter und Modell der Karte, einschließlich der
  Ausweichen.
  - Gemeint sind die **aktuell angezeigten** Werte, auch ungespeicherte.
  - Doppelte Kombinationen werden einmal geprüft.
- **Schnittstelle:** `POST /api/providers/check` mit `{ checks: [{ provider, model }] }`, höchstens 30
  Einträge.
  - Je Eintrag eine **kostenlose** Abfrage, keine Transkription und kein Chat mit Tokens:
    - OpenAI, Mistral und Anthropic: `GET /v1/models/{model}`;
    - AssemblyAI: Schlüsselprüfung, dazu das Modell gegen die feste Liste.
  - Zeitlimit 10 s je Abfrage, alle parallel.
  - Antwort: `{ results: [{ provider, model, ok, reason? }] }`.
  - `reason` ist eines von `invalid_key`, `model_unavailable`, `timeout`, `network`, `http_<n>`.
- **Nebenwirkung:** 401/403 aktualisieren den Schlüsselstatus (`recordProviderResponse`).
- **Anzeige:**
  - ✓ oder ⚠ im Statusfeld jeder Zeile.
  - Darunter „Alle Anbieter erreichbar · geprüft hh:mm“ oder „⚠ n Probleme“ mit je einer Zeile, etwa
    „Claude · claude-sonnet-5-5: Modell nicht verfügbar. Betrifft: Diktat Formal“.
  - Die Meldungen auf Deutsch:

    | Grund | Meldung |
    |---|---|
    | `invalid_key` | Schlüssel ungültig |
    | `model_unavailable` | Modell nicht verfügbar |
    | `timeout` | keine Antwort (Zeitüberschreitung) |
    | `network` | nicht erreichbar |
    | `http_<n>` | Fehler HTTP n |

  - Ändert sich eine Zeile, verfällt ihr Status.
- **Sicherheit:**
  - Keine Schlüssel und keine rohen Fehlertexte der Anbieter in Antwort oder Anzeige.
  - Kein offener Proxy: Erlaubt sind nur bekannte Anbieter, die Modell-ID nach dem Muster oben, und der
    Abruf geht nur an die festen Endpunkte.

## 5 · Einklappbares Hauptmenü (Desktop)

- **Umschalter:** Ein Knopf neben „voitex“ klappt das Menü auf eine Symbolleiste von etwa 56 px ein und
  wieder aus (`aria-label` „Menü einklappen“ / „Menü ausklappen“, `aria-expanded`).
- **Eingeklappt:**
  - nur Symbole;
  - Name als Tooltip und als zugänglicher Name;
  - der aktive Eintrag bleibt markiert;
  - „Einstellungen“ bleibt unten.
- **Gedächtnis:** Das Gerät merkt sich die Wahl (`localStorage`, mit try/catch).
- **Ohne gespeicherte Wahl** startet das Menü unter 1100 px Fensterbreite eingeklappt, darüber offen.
- Die Übergangsanimation entfällt bei `prefers-reduced-motion`.
- Mobil (< 768 px) bleibt die heutige untere Leiste unverändert.

## Nicht Teil dieser Änderung

- Eigene Modell-IDs per Freitext.
- Kostenpflichtige Probeaufrufe.
- Ausweiche für die Nachbearbeitung.
- Einklappen der zweiten Ebene (Einstellungsliste).

## Abnahme

- A1 Backend-Tests (fetch gemockt):
  - Ableitung alter `settings.json` ohne Verhaltensänderung, darunter `meetingFallback: true` →
    AssemblyAI-Ausweiche;
  - Validierung neuer Felder;
  - Modelllisten aus Anbieter-Antworten gefiltert, Fallback bei Fehler, Standardmodell immer enthalten;
  - Aufrufe nutzen das gewählte Modell (Mistral, OpenAI, Anthropic, AssemblyAI);
  - Diktat-Ausweiche bei 5xx/429/Netzwerk/401, nicht bei 400;
  - Verlaufsdaten nennen den genutzten Anbieter;
  - Verbindungstest ok/401/404/Timeout/Netzwerk;
  - unbekannter Anbieter und ungültige Modell-ID werden abgelehnt;
  - höchstens 30 Einträge;
  - keine Schlüssel in Antworten.
- A2 Frontend-Tests:
  - Gliederung und Zeilen wie im Entwurf;
  - Modellliste wechselt mit dem Anbieter;
  - nicht mehr angebotenes Modell bleibt sichtbar;
  - US-Hinweis;
  - Test sendet ungespeicherte Werte ohne Doppelte;
  - Status je Zeile und Fehlerliste;
  - Status verfällt bei Änderung;
  - Menü ein- und ausklappen, gemerkte Wahl, Standard nach Breite, Tooltips und `aria`;
  - Container-Anordnung (Klasse bzw. Struktur).
- A3 `pnpm check`, `pnpm test`, `pnpm build` grün.
- A4 Am Effekt:
  - **Lead:**
    - echte Modelllisten der vier Anbieter ansehen;
    - Verbindungstest mit echten Schlüsseln, alles grün;
    - Gegenprobe mit einem nicht vorhandenen Modell;
    - je ein Diktat mit Mistral- und OpenAI-Spracherkennung;
    - Ausweiche erzwingen, z. B. mit einem ungültigen Modell für die Hauptauswahl.
  - **Mensch:** Darstellung bei halber Fensterbreite mit offenem und eingeklapptem Menü; ein Diktat mit
    neuem Modell.
