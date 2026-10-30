# Änderung 30.10.2026 — Leertaste und Pausenanzeige für Meetings

Status: freigegeben · Mensch, 30.10.2026 („Leertaste und Pausenanzeige ergänzen“). Betrifft F-006 und F-011.
Ergänzt `specs/changes/2026-10-30-diktat-pause.md`. Backend unverändert.

## Anlass

Meetings können schon pausiert werden (Knopf „Pause“ / „Fortsetzen“ in „Meetings“). Wie beim Diktat
sollen die Leertaste und eine deutliche Pausenanzeige dazukommen.

## Verhalten

1. **Pausenanzeige** (Phase `paused`):
   - Statt des Pegels (bzw. der beiden Pegel „Mikrofon“/„Computer“) steht „Pausiert“.
   - Die Laufzeit steht still und blinkt dezent wie im Diktat-Overlay (Ruhe bei
     `prefers-reduced-motion`).
   - Der Status ist für Screenreader angesagt (`role="status"`).
   - Die Anzeige „gesichert bis …“ bleibt sichtbar.
2. **Leertaste:**
   - Sie schaltet Pause und Fortsetzen um, solange eine Meeting-Aufnahme läuft oder pausiert ist und
     der Fokus in der Aufnahme-Karte liegt.
   - Nicht in Eingabefeldern, Textbereichen, Auswahllisten oder editierbaren Elementen; kein globales
     Tastenkürzel.
   - Liegt der Fokus auf einem Knopf, darf die Leertaste nicht zusätzlich dessen Klick auslösen (kein
     doppeltes Umschalten, kein versehentliches „Beenden“): `preventDefault`, und es gilt nur
     Pause/Fortsetzen.
   - Ohne Wirkung in den Phasen `interrupted` und `recovery`; „Fortsetzen“ startet dort einen neuen Teil
     und bleibt ein bewusster Klick.
3. **Einstellung:**
   - Dieselbe Einstellung `dictationSpacePause` (Schlüssel bleibt, damit keine Migration nötig ist).
   - Die Beschriftung in den Einstellungen wird allgemein: „Leertaste pausiert und setzt Aufnahmen fort
     (Diktat und Meetings)“.
   - Ist sie aus, wirkt die Leertaste nirgends.

## Umsetzung (Hinweise für den Worker)

- `apps/frontend/src/views/ProtocolView.tsx`: Pausenanzeige, Tastenbehandlung auf der Aufnahme-Karte.
- Einstellung aus dem bestehenden Settings-Kontext lesen.
- Die Tastenlogik möglichst mit dem Diktat-Overlay teilen (eine kleine Hilfsfunktion), wenn das ohne
  Umbau geht.
- German UI, keine neuen Abhängigkeiten.

## Abnahme

- A1 Frontend-Tests:
  - „Pausiert“ statt Pegel, Laufzeit steht;
  - Leertaste pausiert und setzt fort, nur bei eingeschalteter Einstellung und Fokus in der Karte;
  - keine Wirkung in Eingabefeldern;
  - Fokus auf „Beenden“ plus Leertaste beendet nicht;
  - keine Wirkung in `interrupted` und `recovery`.
- A2 `pnpm check`, `pnpm test`, `pnpm build` grün.
- A3 Am Effekt (Mensch): Meeting am PC, mit der Leertaste pausieren und fortsetzen; ein Teil, keine
  Unterbrechungsmarke.
