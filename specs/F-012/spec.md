# F-012 — Übersetzer: Zielsprache im Overlay

Status: Entwurf · 27.10.2026 · Freigabe: ausstehend

## Ziel

Ein Diktat direkt in einer gewählten Zielsprache ausgeben, unabhängig von der
gesprochenen Sprache. Ersetzt und erweitert den Schalter „Nach Englisch übersetzen“
aus V2T.

## Overlay-Aufbau (neu)

```
            [ Formal ▾ ]          ← Modus-Chip, über dem Aufnahmeknopf
   [ DE ▾ ]     ( ● )     [ → EN ▾ ]
   Aufnahme-    Auf-      Zielsprache
   sprache      nahme
```

- Links: Aufnahmesprache (Auto, DE, EN, HR), Standard DE — unverändert aus F-005.
- Mitte: Aufnahmeknopf; der Modus-Chip sitzt **darüber** statt rechts daneben.
- Rechts: neuer Chip **Zielsprache**: „Wie gesprochen“ (Standard), Deutsch, Englisch,
  Kroatisch. Kurzform im Chip: `=`, `→ DE`, `→ EN`, `→ HR`.
- Während der Aufnahme bleibt die Kapsel (Zeit, Pegel, Stopp) wie heute; die Chips
  sind dann ausgeblendet bzw. gesperrt.
- Handy: gleiche Anordnung, Chips dürfen kompakter werden; kein horizontales Scrollen
  bei 360 px Breite.
- Die Wahl wird pro Gerät gespeichert (localStorage), wie Modus und Aufnahmesprache.

## Verhalten

1. Transkription läuft wie bisher in der **Aufnahmesprache**.
2. Lexikon-Ersetzung und Snippet-Prüfung laufen auf dem Transkript, also **vor** der
   Übersetzung (Lexikon-Einträge bleiben einsprachig).
3. Snippet-Treffer: Der Snippet-Text wird **unverändert** ausgegeben, nicht übersetzt
   (Snippets sind fester Text). → offene Frage F1.
4. Sonst `POST /api/process` mit zusätzlichem Feld `targetLanguage`. Das Backend
   hängt an den Modus-Prompt eine Zusatzanweisung: „Gib ausschließlich das finale
   Ergebnis auf <Sprache> aus …“ (wie heute `translateToEnglish`, nur je Sprache).
   Ein Aufruf, kein zusätzlicher Übersetzungsschritt.
5. `targetLanguage = "source"` oder fehlend → keine Zusatzanweisung, Verhalten wie heute.
6. Karte „Letztes Ergebnis“ und Verlauf zeigen die Zielsprache in der Meta-Zeile,
   z. B. „Formal · → EN · OpenAI · 12,3 s“ (nur wenn ≠ „Wie gesprochen“).

## Schnittstelle

- `POST /api/process`: neues optionales Feld
  `targetLanguage: "source" | "de" | "en" | "hr"`. Unbekannter Wert → 400.
  `translateToEnglish: true` bleibt als Alias für `"en"` gültig (Abwärtskompatibilität).
- Verlaufseintrag: neues optionales Feld `targetLanguage` (fehlt bei alten Einträgen =
  „Wie gesprochen“). Backend-Validierung von `/api/history` entsprechend erweitern;
  alte Einträge bleiben gültig.
- Die Liste der Zielsprachen steht an **einer** Stelle je Workspace (Frontend-Liste,
  Backend-Mapping Code → Sprachname), damit weitere Sprachen eine Zeile kosten.

## Nicht Teil dieses Specs

Übersetzung von Meetings/Protokollen (F-006/F-007), automatische Spracherkennung der
Zielsprache, weitere Sprachen über DE/EN/HR hinaus.

## Offene Fragen

- F1 Sollen Snippets bei gewählter Zielsprache ebenfalls übersetzt werden?
  Vorschlag: nein.

## Abnahme

- A1 Backend-Tests: `targetLanguage` erzeugt je Sprache die Zusatzanweisung;
  `"source"`/fehlend → Prompt unverändert; ungültiger Wert → 400;
  `translateToEnglish: true` ≙ `"en"`; Verlauf mit und ohne `targetLanguage` gültig.
- A2 Frontend-Tests: Zielsprache wird an `process` übergeben; Snippet-Treffer ohne
  LLM-Aufruf und unübersetzt; Meta-Zeile zeigt Zielsprache nur wenn gesetzt;
  Präferenz wird gespeichert und mit ungültigem Wert auf Standard zurückgesetzt.
- A3 `pnpm check`, `pnpm test`, `pnpm build` grün.
- A4 Am Effekt (Mensch): auf `https://voitex.pmsuite.eu` Deutsch diktieren mit
  Zielsprache Englisch und Kroatisch → Text in der Zielsprache in Zwischenablage,
  Karte und Verlauf; Overlay auf Handy und PC wie skizziert.
