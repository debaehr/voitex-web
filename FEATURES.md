# FEATURES — voitex-web

> Fortschritts-Verfolgung. Was soll das Projekt können, und was davon ist fertig.
> Langlebig — wächst mit dem Produkt, wird nicht wie SESSION.md überschrieben.

<!--
  ROLLENVERTEILUNG (verbindlich):
  - DER MENSCH besitzt die Feature-Einträge. Nur er legt Features an,
    formuliert sie um oder entfernt sie. Das ist Produktentscheidung.
  - DER AGENT pflegt NUR den Status (offen → in-arbeit → fertig | blockiert).
    Er erfindet keine Features, streicht keine, formuliert keine um.

  Diese Datei wird versioniert und liegt auf GitHub. Keine Zugangsdaten.

  ZEILEN-GRAMMATIK (genau einhalten, sonst bricht der JSON-Export):
    - `F-001` Titel des Features — **offen**
    - `F-002` Titel des Features — **in-arbeit**
    - `F-003` Titel des Features — **fertig**
    - `F-004` Titel des Features — **blockiert** · kurzer Grund

  Regeln:
  - ID ist stabil und einmalig (`F-<3-stellig>`). Einmal vergeben, nie neu belegen.
    Entfällt ein Feature, Status auf **verworfen** setzen statt die ID zu recyceln.
  - Genau ein Status pro Zeile, fett, aus: offen | in-arbeit | fertig | blockiert | verworfen.
  - Bei **blockiert**: Grund nach dem `·` ist Pflicht (der nächste Agent muss ihn kennen).
  - Titel: knapp, im Original (meist Deutsch). Kein Zeilenumbruch innerhalb einer Zeile.
  - Gruppierung nach Modul/Bereich über `###`-Überschriften ist erlaubt und empfohlen.
-->

---

## Status-Legende

- **offen** — noch nicht begonnen
- **in-arbeit** — aktuell in Bearbeitung (gehört in SESSION.md §1)
- **fertig** — implementiert und verifiziert
- **blockiert** — kann nicht weiter, Grund steht dahinter
- **verworfen** — bewusst fallengelassen (ID bleibt reserviert)

---

## Oberfläche

- `F-001` App-Rahmen im Voitex-Layout (Sidebar, Kopfzeile, Zwei-Ebenen-Ansichten) — **in-arbeit**
- `F-002` Hell/Dunkel/System-Farbschema — **fertig**
- `F-003` Overlay-Leiste wie in Voitex (Sprache, Aufnahme, Workflow, Status-Pille) — **offen**
- `F-004` Mobile Ansicht für die PWA — **in-arbeit**

## Aufnahme und Meetings

- `F-005` Diktat mit Modi und KI-Nachbearbeitung — **fertig**
- `F-012` Übersetzer: Zielsprache im Overlay (mind. Deutsch, Englisch, Kroatisch) — **fertig**
- `F-013` Eigene Modi mit eigenem Prompt anlegen und löschen — **fertig**
- `F-006` Langzeitaufnahme bis 3 h mit Sprecherzuordnung (AssemblyAI) und Protokoll — **in-arbeit**
- `F-007` Meeting-Upload mit Sprecherzuordnung und Zusammenfassung — **in-arbeit**
- `F-014` Mistral als Standard-Anbieter (Datenschutz) — **in-arbeit**

## Arbeitsmittel und Daten

- `F-008` Verlauf mit Suche, Kopieren und Einzellöschung — **fertig**
- `F-009` Lexikon — **fertig**
- `F-010` Snippets — **fertig**
- `F-011` Einstellungen (Anbieter, Prompts, Darstellung) — **fertig**

---

<!--
  Pflege durch den Agenten:
  - Beginnt Arbeit an F-0xx: Status auf **in-arbeit**, und F-0xx in SESSION.md §1 nennen.
  - Fertig UND verifiziert: Status auf **fertig**.
  - Geht nicht weiter: Status auf **blockiert** · Grund. Zusätzlich SESSION.md §6.
  - NIE den Titel ändern, NIE Einträge löschen, NIE neue Features erfinden.
    Fehlt ein Feature, notiert der Agent das als offene Frage in SESSION.md §6.
-->
