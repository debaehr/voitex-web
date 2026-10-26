# SESSION STATE — voitex-web

> **Letztes Update:** 261026_1910 · **von:** Claude Opus 5.5
> **Branch:** main · **Node:** tool-01

<!--
  PFLICHTLEKTÜRE FÜR JEDEN AGENT.
  Lies diese Datei VOLLSTÄNDIG, bevor du irgendetwas tust.
  Das ist der verbindliche aktuelle Stand des Projekts — er hat Vorrang
  vor deinem eigenen Eindruck aus dem Chatverlauf.
  Schreib-/Leseregeln: siehe AGENTS.md → "Session-Handoff-Protokoll".

  Keine Zugangsdaten in dieser Datei. Sie wird versioniert und liegt
  auf GitHub. Verweise auf den Ablageort, nie auf den Wert.
-->

---

## 1 — Aktueller Task
<!-- Was wird GERADE bearbeitet? 1–3 Sätze. Kein Roman. -->

Projekt-Setup abgeschlossen (Skill `projekt-anlegen`). Nächster Schritt:
Aufbau beginnen — Web-Version von Voitex im Voitex-Layout als Ersatz für V2T
auf dem Firmenrechner, inkl. Sitzungsaufnahme bis 3 h mit Sprecherzuordnung.

---

## 2 — Letzter Stand / Wo unterbrochen
<!-- Konkret. Datei:Zeile, Funktion, Testname. Damit der nächste Agent
     nicht suchen muss, wo der Faden liegt. -->

- **Fertig:** Phase A (Verzeichnis, Git, `init_project.sh --check` ok),
  Phase B (Deploy-Key, `origin` = `git@github-dk-voitex-web:debaehr/voitex-web.git`),
  `FEATURES.md` F-001–F-011 vom Menschen bestätigt.
- **Vorlagen:** Voitex-Desktop-Code `debaehr/voitex` (Electron, React 19,
  Tailwind v4, shadcn-Stil, lucide-react) — nur lesend klonen, nicht kopieren
  ohne Prüfung. V2T `/opt/v2t` (`PMSuite-eu/v2t`) als funktionale Basis
  (Provider, AssemblyAI, Lexikon, Snippets). Analyse des Voitex-Layouts und
  Screenshots stammen aus der V2T-Session vom 26.10.2026.
- **Build/Test-Status:** noch kein Code.

---

## 3 — Offene TODOs
<!-- Geordnet nach Priorität. Erledigtes abhaken, nicht löschen,
     bis es nach DECISIONS_LOG.md archiviert wird. -->

- [ ] Phase C: Stack aufsetzen (pnpm-Workspace `apps/frontend` + `apps/backend`
  wie V2T), Backend auf `127.0.0.1:3006`, PM2 als `torsten`.
- [ ] Offen: Tailwind ja/nein und `lucide-react` (neue Dependency) entscheiden.
- [ ] `/impeccable init` für `PRODUCT.md`/`DESIGN.md` ausführen.
- [ ] Phase D: prüfen, dass `/opt/voitex-web/data` vom Backup (`SOURCES=(/)`) erfasst ist.
- [ ] Phase E (später, auf Wunsch des Menschen): `voitex.pmsuite.eu` — nginx,
  Caddy auf edge-01, Authentik, DNS.

---

## 4 — Aktive Entscheidungen (Kurzform)
<!-- Nur was JETZT noch relevant ist. Sobald eine Entscheidung
     abgeschlossen/überholt ist → ab nach DECISIONS_LOG.md. -->

- 261026: Stack wie V2T (React + Vite PWA, Node/Express, PM2, nginx) — sonst wird der Umbau zu umfangreich.
- 261026: Keine Daten aus V2T übernehmen; Betrieb als `torsten`, kein Service-Account.
- 261026: V2T bleibt bis auf Fixes unverändert und läuft parallel weiter.

---

## 5 — Constraints / Nicht anfassen
<!-- Bereiche, die tabu sind, oder harte Vorgaben für diese Phase. -->

- Keine Zugangsdaten, Token oder Schlüssel versionieren.

---

## 6 — Offene Fragen an den Menschen
<!-- Echte Blocker, die ein Agent nicht selbst entscheiden darf.
     Leer lassen, wenn keine. -->

- —

---

<!--
  VOR SESSIONENDE / VOR JEDEM WERKZEUG- ODER MODELLWECHSEL:
  1. Abschnitte 1–3 aktualisieren.
  2. Update-Zeile oben mit Zeitstempel + deinem Modellnamen setzen.
  3. Diese Datei mit eigener Commit-Message committen: "session: <kurz>".
  4. PUSHEN. Ohne Push erreicht der Stand den nächsten Node nicht.
  Halte die Datei unter ~150 Zeilen. Archiviere Altes nach DECISIONS_LOG.md.
-->
