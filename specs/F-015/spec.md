# F-015 — Claude als Anbieter (Textaufgaben)

Status: freigegeben · 27.10.2026 · Freigabe: Mensch, 27.10.2026 (SDK `@anthropic-ai/sdk` erlaubt)

## Ziel

Claude (Anthropic) als zusätzlicher Anbieter für Textaufgaben: Protokoll, Zusammenfassung,
Diktat-Nachbearbeitung (Standard- und eigene Modi) und Übersetzung. Keine Spracherkennung
(Claude hat keine Audio-Transkription), kein Meeting-Anbieter.

## Verhalten

- Schlüssel `ANTHROPIC_API_KEY` in `apps/backend/.env` (vorhanden, live mit HTTP 200 geprüft).
- Modell **`claude-sonnet-5-5`** (Entscheidung Mensch), per Umgebungsvariable
  `ANTHROPIC_CHAT_MODEL` änderbar.
- Aufruf über das offizielle SDK `@anthropic-ai/sdk` (Messages API, `client.messages.create`),
  kein selbstgebauter HTTP-Aufruf. **Neue Runtime-Abhängigkeit → Freigabe nötig.**
- Anfrage: `system` = Modus-/Protokoll-Prompt (inkl. Zielsprache, F-012), `messages` = Text;
  `max_tokens` 16000 (Denkanteil zählt mit hinein); `output_config.effort`
  `medium` für Protokoll/Zusammenfassung, `low` für Diktat/Übersetzung; Denken bleibt
  Standard (adaptiv); kein `temperature`/`top_p` (seit 21.10.2026 von der API abgelehnt).
  Antwort = Text-Blöcke zusammengefügt; Denk-Blöcke werden ignoriert.
- Bei Ablehnung durch Sicherheitsfilter (`stop_reason: "refusal"`) springt die Anthropic-
  eigene Ausweiche auf ein anderes Claude-Modell ein (`fallbacks: "default"`, Beta-Header
  `server-side-fallback-2026-07-01`). Bleibt die Ablehnung bestehen: klare Fehlermeldung.
- Schlüsselprüfung (Lauf 3b) um Anthropic erweitern: `GET https://api.anthropic.com/v1/models`.
- `/api/providers`: neues Feld bzw. Fähigkeit so, dass Claude nur in **Textlisten** erscheint
  (`llm`), nicht unter `stt` und nicht unter `meetings`. Diktat-Modi bestehen aus
  Transkription + Nachbearbeitung: Steht ein Modus auf Claude, transkribiert Mistral
  (Standard) und Claude bearbeitet nach. Die Einstellungen zeigen das als Hinweis
  „Spracherkennung über Mistral“.
- Anzeigename „Claude“; Ergebnis-Metadaten nennen „Claude · claude-sonnet-5-5“.

## Nicht Teil dieses Specs

Claude für Spracherkennung oder Meetings, Prompt-Caching, Streaming-Ausgabe.

## Abnahme

- A1 Backend-Tests (SDK gemockt): Anfrageform (Modell, system, max_tokens, effort, keine
  Sampling-Parameter, fallbacks), Textextraktion ohne Denk-Blöcke, Refusal → Fehler,
  401 → Schlüssel ungültig, Claude nicht in `stt`/`meetings`, keine Schlüssel in Antworten.
- A2 Frontend-Tests: Claude nur in Textlisten; Modus auf Claude → Transkription Mistral.
- A3 `pnpm check`, `pnpm test`, `pnpm build` grün.
- A4 Am Effekt: Zusammenfassung einer Testsitzung mit Claude; Diktat „Formal“ mit Claude.
