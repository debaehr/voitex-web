# Änderung 27.10.2026 — Systemton mit aufnehmen (Meetings am PC)

Status: freigegeben · Mensch, 27.10.2026 (Schalter standardmäßig aus). Betrifft F-006 (Aufnahme im Browser). Backend unverändert.

## Anlass

Eine Teams-Besprechung am PC mit einer Freisprecheinrichtung (Jabra PH5002W) wurde aufgenommen. In der
Aufnahme war nur die eigene Stimme zu hören. Die App greift nur das Mikrofon ab (`getUserMedia`), und die
Echounterdrückung des Geräts entfernt das Gegenüber aus dem Mikrofonsignal. Die Desktop-App löst das mit
Electron-Loopback über `getDisplayMedia` (`debaehr/voitex`, `src/main/meeting/meeting-modul.ts`). Im
Browser steht dieselbe Schnittstelle zur Verfügung, allerdings mit einem Auswahldialog, den der Mensch
selbst bestätigen muss.

## Verfügbarkeit

- **Chrome und Edge unter Windows:** Systemton („Gesamter Bildschirm“ + „Systemaudio teilen“) oder
  Tab-Audio („Tab“ + „Tab-Audio teilen“, z. B. Teams im Browser).
- **macOS mit Chrome:** nur Tab-Audio.
- **Nicht verfügbar:** Firefox, Safari, Android, iPhone.
- Erkennung: `navigator.mediaDevices.getDisplayMedia` vorhanden **und** kein Mobilgerät (iOS laut
  `isIOSDevice`, Android laut User-Agent). Ohne Unterstützung erscheint der Schalter nicht, und es gibt
  keinen Hinweis.

## Verhalten

1. **Vor dem Start** erscheint der Schalter „Ton des Computers mit aufnehmen (Teams, Zoom …)“. Er ist
   standardmäßig aus; die letzte Wahl merkt sich das Gerät (`localStorage`, mit try/catch).
   - Ist er an, zeigt die Hinweis-Karte zusätzlich: „Im folgenden Dialog ‚Gesamter Bildschirm‘ wählen
     und ‚Systemaudio teilen‘ anhaken. Bei Teams im Browser: den Teams-Tab mit Tab-Audio wählen. Es wird
     nur Ton aufgenommen, kein Bild. Aufgenommen wird alles, was der Computer abspielt, auch
     Benachrichtigungstöne.“
2. **Start mit Systemton:**
   - `getDisplayMedia` wird **zuerst** aufgerufen, solange die Klick-Geste noch gültig ist; danach folgt
     das Mikrofon.
   - Optionen: `video: true` (Chromium verlangt eine Videospur), `audio` ohne Echounterdrückung,
     Rauschunterdrückung und automatische Verstärkung, `systemAudio: "include"`,
     `selfBrowserSurface: "exclude"`.
   - Alle Videospuren werden sofort gestoppt.
   - **Liefert die Freigabe keine Tonspur** (Haken vergessen), stoppt sie die App und meldet: „Es wurde
     kein Ton freigegeben. Bitte erneut versuchen und ‚Systemaudio teilen‘ anhaken.“ Dazu gibt es die
     Knöpfe „Erneut versuchen“ und „Nur Mikrofon“.
   - **Bricht der Mensch den Dialog ab,** erscheint dieselbe Auswahl. Es startet nichts ungefragt.
3. **Mischung im Browser:**
   - Mikrofon und Systemton laufen über je einen `GainNode` (1,0) in einen
     `MediaStreamAudioDestinationNode`, mono, im selben `AudioContext` wie die Pegelanzeige.
   - Der `MediaRecorder` nimmt den gemischten Strom auf. Format, 32 kbit/s, 5-s-Stücke und Upload
     bleiben unverändert.
   - Ein Teil bleibt eine durchgehende Datei. Der Server und die Diarisierung sehen eine normale
     Aufnahme.
4. **Anzeige:** zwei Pegel, „Mikrofon“ und „Computer“. Ohne Systemton bleibt es bei einem Pegel wie
   heute.
5. **Systemton endet während der Aufnahme:**
   - Anlass ist „Freigabe beenden“ in der Chrome-Leiste oder das Ende der Spur.
   - Das ist **keine** Unterbrechung: Die Aufnahme läuft im selben Teil mit dem Mikrofon weiter.
   - Ein Hinweis zeigt „Computerton wird nicht mehr aufgenommen“ mit dem Knopf „Erneut freigeben“. Der
     Knopf ruft `getDisplayMedia` erneut auf und hängt die neue Tonspur ohne neuen Teil in die Mischung.
   - `mute` und `unmute` der Systemtonspur werden ignoriert, weil sie in Sprechpausen normal sind
     (Erfahrung aus der Desktop-App).
6. **Mikrofon-Unterbrechung, Recorder-Fehler, Pause:** Verhalten wie bisher. Pause hält die gemischte
   Aufnahme an.
7. **Fortsetzen nach einer Unterbrechung und Wiederherstellen nach dem Neuladen:**
   - Lief der letzte Teil mit Systemton, fragt der neue Teil die Freigabe erneut ab.
   - Bricht der Mensch ab, wählt er zwischen „Nur Mikrofon“ und „Erneut versuchen“. Die Lückenmarke
     bleibt wie bisher.
8. **Beenden und Stopp nach 3 h** beenden alle Spuren, auch die Bildschirmfreigabe. Die Chrome-Leiste
   verschwindet dann.
9. **Diktat und Datei-Upload** bleiben unverändert.

## Umsetzung (Hinweise für den Worker)

- `MeetingEnvironment` bekommt `systemAudioSupported: boolean`. `openCapture` nimmt
  `{ systemAudio: boolean }` entgegen.
- `MeetingCapture` meldet ein Ereignis `systemAudioEnded` und bietet `addSystemAudio()` zum erneuten
  Freigeben. Beides ist von Hand testbar mit Fake-Strömen.
- `MeetingRecorderController` merkt sich `systemAudio` je laufender Sitzung (auch im
  Wiederherstellungs-Datensatz der IndexedDB), damit „Fortsetzen“ weiß, ob gefragt werden muss.
  Bestehende Datensätze ohne das Feld gelten als „nur Mikrofon“.
- Fehlermeldungen auf Deutsch. `NotAllowedError` aus `getDisplayMedia` gilt als Abbruch, nicht als
  Fehler.
- Keine neuen Abhängigkeiten.

## Nicht Teil dieser Änderung

- Getrennte Spuren je Quelle (Stereo oder zwei Dateien). Die Desktop-App nimmt zwei Spuren auf; hier
  reicht eine gemischte Spur, weil Mistral über die Stimmen trennt.
- Systemton auf Mobilgeräten (technisch nicht möglich).
- Automatisches Erkennen des Teams-Fensters.

## Abnahme

- A1 Frontend-Tests:
  - Schalter nur bei Unterstützung.
  - Reihenfolge Bildschirm vor Mikrofon.
  - Videospuren gestoppt.
  - Freigabe ohne Tonspur und abgebrochener Dialog führen zur Auswahl.
  - Ende des Systemtons: Aufnahme läuft, Hinweis erscheint, „Erneut freigeben“ hängt die Spur ohne neuen
    Teil an.
  - `mute` der Systemtonspur löst keine Unterbrechung aus.
  - „Fortsetzen“ und Wiederherstellung fragen erneut, alte Datensätze laufen weiter.
  - Beenden stoppt alle Spuren.
- A2 `pnpm check`, `pnpm test`, `pnpm build` grün.
- A3 Am Effekt (Mensch):
  - Teams-Desktop-Call mit dem Jabra, 10–15 min: beide Seiten im Transkript, Sprecher getrennt.
  - Teams im Browser-Tab mit Tab-Audio.
  - Freigabe mitten in der Aufnahme beenden und erneut freigeben: keine Lücke beim Mikrofon.
  - Browserfenster 10 min minimiert: Aufnahme läuft weiter (Risiko: gedrosselter `AudioContext` im
    Hintergrund).

## Entschiedene Fragen

- F1 Schalter standardmäßig aus. Mensch, 27.10.2026.
