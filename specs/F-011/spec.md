# F-011 — Einstellungen (Anbieter, Prompts, Darstellung)

Status: Entwurf · 26.10.2026 · Freigabe: ausstehend

## Ziel

Einstellungen geräteübergreifend serverseitig speichern; Darstellung bleibt pro
Gerät (bereits umgesetzt, F-002).

## Datenformat `data/settings.json`

```json
{ "version": 1,
  "providers": { "original": "openai", "casual": "openai", "formal": "openai",
                 "coding": "openai", "protocol": "openai", "summary": "openai" },
  "prompts": { "original": "…", "casual": "…", "formal": "…", "coding": "…",
               "protocol": "…", "summary": "…" },
  "lexicon": [], "snippets": [], "ownSpeakerName": "Ich" }
```

Fehlende Felder werden beim Laden mit Standardwerten ergänzt (Standard-Prompts aus
dem Backend, `GET /api/settings/defaults`).

## Verhalten

1. Seite „Einstellungen“, Band: Anbieter · Modi & Prompts · Darstellung.
2. **Anbieter:** Auswahl je Modus; nicht konfigurierte Anbieter (`GET /api/providers`)
   sind deaktiviert und als „kein Schlüssel“ markiert.
3. **Prompts:** Textfeld je Modus mit „Standard laden“.
4. Änderungen werden erst mit „Einstellungen speichern“ übernommen (Knopf nur aktiv
   bei Änderungen); beim Verlassen mit ungespeicherten Änderungen Rückfrage.
5. Lexikon (F-009) und Snippets (F-010) speichern sofort beim Bestätigen des Dialogs.
6. Laden fehlgeschlagen → kein Speichern möglich, Hinweis; nie lokalen Stand über
   den Server schreiben (Lehre aus V2T).
7. Speichern sendet das ganze Objekt (`PUT /api/settings`); Antwort wird geprüft,
   Fehler sichtbar.

## Abnahme

- A1 Backend-Tests: Defaults-Endpunkt, `PUT` mit ungültigem Body → 400, atomares Schreiben.
- A2 Frontend-Tests: Ergänzen fehlender Felder, Dirty-Erkennung.
- A3 `pnpm check`, `pnpm test`, `pnpm build` grün.
- A4 Am Effekt: Prompt ändern, speichern, auf zweitem Gerät nach Neuladen sichtbar.
