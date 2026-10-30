# Änderung 30.10.2026 — Pause im Diktat

Status: freigegeben · Mensch, 30.10.2026 (Leertaste als Einstellung). Betrifft F-005 (Diktat), das Overlay (F-003) und
F-011 (Einstellungen).

## Anlass

Wird der Mensch beim Diktieren unterbrochen, bricht er heute ab und startet ein neues Diktat. Der Text
zerfällt dann in mehrere Einträge. Eine Pause soll das Diktat anhalten und es später nahtlos fortsetzen
lassen. Am Ende entsteht ein Text und ein Verlaufseintrag.

## Verhalten

1. **Overlay während der Aufnahme:** Neben dem Stopp-Knopf steht ein Pause-Knopf (`Pause`-Symbol,
   `aria-label` „Diktat pausieren“).
   - Während der Pause zeigt die Kapsel „Pausiert“ statt der Pegelwelle.
   - Die Laufzeit bleibt stehen und blinkt dezent (Ruhe bei `prefers-reduced-motion`).
   - Der Knopf wechselt zu „Fortsetzen“ (`Play`-Symbol).
   - Stopp bleibt in beiden Zuständen verfügbar und verarbeitet alles bisher Aufgenommene.
2. **Technik:** `MediaRecorder.pause()` / `resume()`; es bleibt eine durchgehende Datei. Die Dauer zählt
   nur die aufgenommene Zeit (für Verlauf und Anbieter-Grenzen).
3. **Mikrofon während der Pause:** Der Mikrofonzugriff bleibt bestehen. Ein Freigeben und neues
   Anfordern würde eine zweite Datei ergeben. Der Browser zeigt sein Aufnahme-Symbol weiter an.
   - Der Pegel wird nicht angezeigt.
   - Es wird nichts aufgenommen.
4. **Tastatur (abschaltbar):** Die Leertaste schaltet zwischen Pause und Fortsetzen um, aber nur wenn
   der Fokus auf dem Overlay liegt (kein globales Tastenkürzel, damit Texteingaben unberührt bleiben).
   - Neue Einstellung `dictationSpacePause` (boolean, Standard **aus**), serverseitig in
     `settings.json` wie die übrigen Einstellungen.
   - Das Backend kennt Standardwert und Prüfung (`mergeWithDefaults`, Validierung); alte
     `settings.json` ohne das Feld gelten als „aus“.
   - In den Einstellungen gibt es einen Schalter „Leertaste pausiert und setzt das Diktat fort“ in einem
     passenden Abschnitt.
5. **Unerwartetes Ende** (Gerät beendet die Aufnahme, Mikrofon getrennt, iPhone wechselt auf den
   Homescreen; mit oder ohne Pause):
   - Das bisher Aufgenommene wird nicht mehr verworfen.
   - Statt „Aufnahme wurde unterbrochen“ fragt das Overlay: „Aufnahme wurde unterbrochen —
     bisherige Aufnahme verarbeiten / verwerfen“.
   - Verarbeiten läuft wie ein normaler Stopp.
6. **Seite verlassen:** Während einer laufenden oder pausierten Aufnahme warnt der Browser beim
   Schließen oder Neuladen (`beforeunload`). Die Aufnahme liegt nur im Arbeitsspeicher.
7. **Sperren:** Während der Pause bleibt das Diktat aktiv. Eine Meeting-Aufnahme bleibt wie bisher
   gesperrt (ein Mikrofon). Modus, Sprache und Zielsprache lassen sich während der Pause nicht ändern
   (wie während der Aufnahme).

## Umsetzung (Hinweise für den Worker)

- `apps/frontend/src/lib/useRecorder.ts`:
  - `pause()`, `resume()` und `paused` ergänzen;
  - Zeitkonto mit aktiven Abschnitten statt `performance.now() - started`;
  - der Pegel-Timer überspringt während der Pause;
  - bei unerwartetem `onstop` die gesammelten Stücke für „verarbeiten“ bereithalten statt nur zu melden.
- `apps/frontend/src/components/OverlayBar.tsx`: Pause/Fortsetzen-Knopf und Zustand „Pausiert“, Stil wie
  die vorhandenen Kapseln, mobil mindestens 44 px Trefferfläche.
- `apps/frontend/src/App.tsx`: Verdrahtung, `beforeunload`, Dialog für das unerwartete Ende.
- Recorder ohne `pause`-Unterstützung: Der Pause-Knopf entfällt.
- Backend nur für die neue Einstellung (Standardwert, Prüfung, Tests).
- German UI, keine neuen Abhängigkeiten.

## Nicht Teil dieser Änderung

- Sicherung des Diktats in IndexedDB (wie bei Meetings).
- Automatische Pause bei Stille.
- Globales Tastenkürzel.

## Abnahme

- A1 Frontend-Tests:
  - Pause und Fortsetzen rufen den Recorder auf;
  - die Laufzeit steht während der Pause;
  - die Dauer zählt ohne Pause;
  - Stopp aus der Pause liefert eine Datei;
  - unerwartetes Ende bietet Verarbeiten und Verwerfen;
  - `beforeunload` nur bei aktiver oder pausierter Aufnahme;
  - Leertaste wirkt nur mit eingeschalteter Einstellung und Fokus im Overlay;
  - Backend: Standardwert `false`, Validierung, alte `settings.json` ohne Feld;
  - der Pause-Knopf fehlt ohne Unterstützung.
- A2 `pnpm check`, `pnpm test`, `pnpm build` grün.
- A3 Am Effekt (Mensch): am PC diktieren, 2 min pausieren, fortsetzen, beenden; ein Text mit beiden
  Abschnitten, ohne die Pause. Dasselbe auf Android und iPhone.
