# Änderung 27.10.2026 — Original-Icon und Anbieter-Listen

Freigabe: Mensch, 27.10.2026 („Plan so umsetzen“). Betrifft F-001/F-004 (PWA) und F-011/F-014.

## Icon

Quelle: Desktop-Version `debaehr/voitex`, `build/icon.ico` (aus `resources/tray.png`, `scripts/gen-app-icon.mjs`).
Vermessen im 256-px-Bild (Lead): fünf Balken, schwarz `#000`, abgerundet (Radius = halbe Breite), Breite 28,
x-Start 22 / 68 / 114 / 160 / 206 (Abstand 46), y-Start 43 / 73 / 102 / 73 / 43, Höhe 104–105.
Zeichenumriss x 22–234, y 43–206 (V-Form).

- Favicon `icon.svg`: Originalzeichen auf transparent; im Dunkelmodus weiß (`prefers-color-scheme` im SVG).
- PWA: `icon-192.png`, `icon-512.png` (+ maskable): schwarzes Zeichen auf Weiß, Zeichen innerhalb der
  sicheren Zone (≤ 80 %), `apple-touch-icon` 180 px. Manifest `theme_color`/`background_color` passend.

## Anbieter-Listen

- Listen zeigen nur Anbieter mit Schlüssel; kein Hinweis auf fehlende Schlüssel (Groq entfällt).
- Schlüsselprüfung im Backend beim Start und alle 6 h über eine kostenlose Abfrage; HTTP 401/403 =
  ungültig, Netzwerkfehler = keine Aussage. Eine echte Anfrage mit 401/403 markiert sofort als ungültig,
  ein späterer Erfolg hebt die Markierung auf.
- Anzeige: „<Anbieter> (Schlüssel ungültig)“, nicht auswählbar, außer bereits eingestellt.
