# F-013 — Eigene Modi anlegen und löschen

Status: Entwurf · 27.10.2026 · Freigabe: ausstehend

## Ziel

Unter Einstellungen → „Modi & Prompts“ eigene Diktat-Modi mit eigenem Prompt
anlegen und wieder löschen (z. B. „Kundenmail“, „Jira-Ticket“). Eigene Modi stehen
überall zur Wahl, wo heute Original/Casual/Formal/Coding stehen.

## Bedienung

- Einstellungen → „Modi & Prompts“: oben Knopf **„+ Modus hinzufügen“**. Neuer Modus
  erscheint als Karte mit Feldern **Name** (Pflicht, max. 40 Zeichen, eindeutig ohne
  Groß-/Kleinschreibung), **Beschreibung** (optional, max. 120 Zeichen, erscheint auf
  der Seite „Modi“) und **Prompt** (Pflicht, max. 8000 Zeichen).
- Jede eigene Karte hat einen **Löschen**-Knopf mit Bestätigungsdialog.
- Gespeichert wird wie heute über „Einstellungen speichern“ (gilt auf allen Geräten);
  ungespeicherte Änderungen lösen den bestehenden Verwerfen-Dialog aus.
- Die vier Standard-Modi bleiben fest: Prompt änderbar und „Standard laden“ wie heute,
  **nicht löschbar** (→ Frage F1). Die Prompts „Protokoll“ und „Zusammenfassung“ sind
  keine Diktat-Modi und bleiben unverändert.
- Anbieter: Unter „Anbieter“ erscheint je eigenem Modus eine Zeile wie bei den
  Standard-Modi (Standard: OpenAI).
- Höchstens 20 eigene Modi.

## Verwendung

- Overlay-Modus-Chip und Seite „Modi“ zeigen Standard-Modi, danach eigene Modi in
  Anlegereihenfolge.
- Diktat mit eigenem Modus: Transkription wie „Original“; Nachbearbeitung über
  `POST /api/process` mit `mode: "original"` und `instructions` = Prompt des eigenen
  Modus (das Backend kennt eigene Modi nicht; `instructions` ersetzt den Standard-Prompt
  bereits heute). Zielsprache (F-012) und Lexikon/Snippets wirken unverändert.
- Wird der gerade gewählte Modus gelöscht (auch auf einem anderen Gerät), fällt die
  Auswahl auf „Formal“ zurück.

## Datenmodell

- `settings.json` bekommt `customModes: Array<{ id, label, description, prompt, provider }>`.
  `id` = `custom-` + UUID, unveränderlich. Bestehende Datei ohne Feld = leere Liste;
  `version` bleibt 1 (rein additive Erweiterung). Backend-Validierung: Feld optional,
  wenn vorhanden Array mit obigen Grenzen, gültiger Anbieter, eindeutige IDs und Namen;
  sonst 400.
- Verlaufseintrag bekommt optional `modeLabel` (Name zum Aufnahmezeitpunkt). `mode`
  speichert die Modus-ID. Anzeige: Standard-Label, sonst `modeLabel`, sonst „Eigener
  Modus“ — so bleiben Einträge gelöschter Modi lesbar. Alte Einträge bleiben gültig.

## Nicht Teil dieses Specs

Reihenfolge per Drag & Drop, Modi exportieren/importieren, Standard-Modi umbenennen.

## Offene Fragen

- F1 Sollen auch die vier Standard-Modi löschbar (oder ausblendbar) sein?
  Vorschlag: nein, nur Prompt änderbar.

## Abnahme

- A1 Backend-Tests: Einstellungen mit und ohne `customModes` gültig; ungültige Einträge
  (leerer Name, doppelte ID/Name, zu langer Prompt, falscher Anbieter, > 20) → 400;
  Verlauf mit `modeLabel` und eigener Modus-ID gültig.
- A2 Frontend-Tests: Anlegen, Bearbeiten, Löschen im Entwurf; Speichern sendet
  `customModes`; Diktat mit eigenem Modus sendet `mode: "original"` und dessen Prompt;
  gelöschter aktiver Modus → „Formal“; Verlaufsanzeige mit `modeLabel`.
- A3 `pnpm check`, `pnpm test`, `pnpm build` grün.
- A4 Am Effekt (Mensch): eigenen Modus anlegen, speichern, im Overlay wählen, diktieren,
  auf zweitem Gerät sichtbar; löschen → verschwindet überall, Verlaufseintrag bleibt
  lesbar.
