# F-005 — Diktat mit Modi und KI-Nachbearbeitung

Status: freigegeben · 26.10.2026 · Freigabe: Mensch, 26.10.2026 (inkl. vitest als devDependency)

## Ziel

Ein Diktat über die Overlay-Leiste aufnehmen, transkribieren, je nach Modus
umschreiben und das Ergebnis sofort nutzbar machen (Zwischenablage, Karte
„Letztes Ergebnis“, Verlauf). Ersetzt das Diktat aus V2T im Voitex-Layout.

## Voraussetzungen (Betrieb, Teil dieses Specs)

- V1 Das Backend liefert das gebaute Frontend (`apps/frontend/dist`) selbst aus:
  statische Dateien, für unbekannte Nicht-`/api`-Pfade `index.html` (SPA-Fallback).
  `/api/*` bleibt unverändert. Grund: nginx leitet alle Pfade an `127.0.0.1:3006`.
- V2 Upload-Limit der App = nginx-Limit: 200 MB.
- V3 Neuer Endpunkt `GET /api/providers` → `{ stt: string[], llm: string[], meetings: boolean }`,
  abgeleitet aus den gesetzten API-Schlüsseln. Keine Schlüssel im Response.
- V4 `language: "auto"` wird nicht an den STT-Anbieter weitergegeben (Erkennung durch
  den Anbieter); heute erzwingt das Backend sonst `de`.

## Verhalten

1. **Start:** Klick auf den Overlay-Punkt fordert das Mikrofon an
   (`getUserMedia({ audio: true })`) und startet `MediaRecorder`. Die Kapsel zeigt
   Zeit und echten Pegel (AnalyserNode, ~20 Werte/s); die Kopfzeile zeigt „Aufnahme läuft“.
2. **Stopp:** Klick auf Stopp beendet Aufnahme und Mikrofon-Spur. Aufnahmen unter
   0,5 s werden verworfen, Meldung „Aufnahme zu kurz“.
3. **Verarbeitung:** Kapsel zeigt „Transkribiere …“, dann „Bearbeite …“.
   - `POST /api/transcribe` mit Audio, Anbieter des Modus, Sprache des Sprach-Chips.
   - Lexikon (F-009) wird auf das Transkript angewendet (wie V2T `applyLexiconToTranscript`).
     Bei OpenAI werden die korrekten Lexikon-Wörter zusätzlich als `prompt` an die
     Transkription übergeben.
   - Ist das **ganze** Diktat ein Snippet-Schlüsselwort (F-010, tolerant gegenüber
     Groß-/Kleinschreibung und Satzzeichen am Rand): Snippet-Text ist das Ergebnis,
     kein LLM-Aufruf.
   - Sonst `POST /api/process` mit Modus, Anbieter und Prompt des Modus (F-011).
4. **Ergebnis:**
   - Angezeigt wird **immer der bearbeitete Text**, auch im Modus Original
     (V2T-Fehler: dort wurde das Rohtranskript gezeigt).
   - Text wird in die Zwischenablage geschrieben; gelingt das nicht, Hinweis
     „Kopieren nicht möglich — Text unten kopieren“, Text bleibt in der Karte.
   - Karte „Letztes Ergebnis“ zeigt Text, Modus, Anbieter, Dauer und Kopieren-Knopf;
     der angezeigte Modus ist der **der Aufnahme**, nicht der aktuell gewählte.
   - Eintrag im Verlauf (F-008) per `POST /api/history`.
5. **Fehler** erscheinen als Warn-Kapsel (3,5 s) und lassen die App bedienbar:
   Mikrofon verweigert/fehlt, kein Text erkannt (leeres Transkript), Anbieter-Fehler,
   Netzwerkfehler. Kein Verlauf-Eintrag bei Fehler.
6. Während Aufnahme oder Verarbeitung ist ein zweiter Start nicht möglich.
7. Modus- und Sprachwahl bleiben pro Gerät gespeichert (localStorage).

## Datenformat Verlaufseintrag (neu, voitex-web-eigen)

```json
{ "id": "string", "createdAt": "ISO-8601", "mode": "original|casual|formal|coding",
  "provider": "OpenAI", "durationSeconds": 12, "text": "Endtext", "raw": "Rohtranskript" }
```

## Nicht Teil dieses Specs

Langzeitaufnahme (F-006), Meetings (F-007), Übersetzen ins Englische, Hotkeys.

## Abnahme

- A1 Backend-Tests: `/api/providers` ohne Schlüsselwerte; `language=auto` erreicht den
  Anbieter nicht als `de`; SPA-Fallback liefert `index.html`, `/api/health` weiter JSON;
  Upload > 200 MB → 413 als JSON.
- A2 Frontend-Tests (Logik als reine Funktionen): Snippet-Treffer nur bei ganzem Diktat;
  Lexikon-Ersetzung; Mindestdauer; Ergebnis trägt den Modus der Aufnahme.
- A3 `pnpm check`, `pnpm test`, `pnpm build` grün.
- A4 Am Effekt (Lead): auf `https://voitex.pmsuite.eu` ein Diktat aufnehmen → Text in
  Zwischenablage, Karte und Verlauf; nach Neuladen im Verlauf vorhanden.
