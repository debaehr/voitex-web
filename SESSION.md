# SESSION STATE — voitex-web

> **Letztes Update:** 261026_2050 · **von:** Claude Opus 5.5
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

Etappe 2 (F-005 Diktat, F-008 Verlauf, F-009 Lexikon, F-010 Snippets,
F-011 Einstellungen): Specs unter `specs/F-0xx/spec.md` als **Entwurf**, warten
auf Freigabe des Menschen. Umsetzung danach per Happier-Delegation auf Codex
(siehe `CLAUDE.md`); Claude schreibt keinen Produktionscode mehr.

---

## 2 — Letzter Stand / Wo unterbrochen
<!-- Konkret. Datei:Zeile, Funktion, Testname. Damit der nächste Agent
     nicht suchen muss, wo der Faden liegt. -->

- **Struktur:** pnpm-Workspace. `apps/backend` = Kopie des V2T-Backends inkl.
  Sync-Fix v1.2.1 (Port 3006, Daten in `data/`, ohne groq-sdk/mistral-SDK).
  `apps/frontend` = React 18 + Vite, Dev-Server Port 5174 (Proxy `/api` → 3006).
- **Design:** `apps/frontend/src/styles.css` — Voitex-Tokens (OKLCH, hell
  Standard, `.dark`), App-Rahmen, Zwei-Ebenen-Band, Primitives, Overlay-Kapsel,
  mobile Tab-Leiste (< 768 px, Liste → Detail).
- **Komponenten:** `components/ui.tsx` (Button, Card, Badge, Field, Input,
  Select, Textarea, Switch), `components/TwoLevel.tsx`, `components/OverlayBar.tsx`
  (Sprache · Aufnahme-Punkt · Modus, Aufnahme-Kapsel, Status-Text),
  `lib/nav.ts`, `lib/theme.ts` (System/Hell/Dunkel, pro Gerät in localStorage).
- **Seiten** `views/*`: Diktat, Protokoll, Meetings, Lexikon, Snippets, Verlauf,
  Einstellungen — Layout mit leeren Zuständen, noch **ohne** Datenanbindung;
  Overlay-Aufnahme ist nur simuliert (`App.tsx`).
- **Build/Test-Status:** `pnpm check` und `pnpm build` grün; Screenshots
  Desktop/Mobil hell/dunkel per Headless-Chrome ohne Konsolenfehler.
- **Screenshot-Werkzeug:** Playwright-MCP scheitert auf tool-01 an fehlenden
  Chrome-Bibliotheken; funktionierende Headless-Shell liegt unter
  `~/.cache/plane-review/chrome-headless-shell-linux64/`.

---

## 3 — Offene TODOs
<!-- Geordnet nach Priorität. Erledigtes abhaken, nicht löschen,
     bis es nach DECISIONS_LOG.md archiviert wird. -->

- [ ] Etappe 2: F-005 Diktat (Mikrofon, Pegel, `/api/transcribe` + `/api/process`,
  Zwischenablage, Verlauf), F-008–F-011 an Backend anbinden.
- [ ] `apps/backend/.env` anlegen — nur der OpenAI-Schlüssel wird aus V2T übernommen.
- [ ] Etappe 3: F-007 Meeting-Upload asynchron (Job-ID + Polling statt synchron),
  F-006 Langzeitaufnahme (Chunks in IndexedDB, Wake Lock, Upload in Teilen,
  AssemblyAI), `max_tokens` je Aufgabe.
- [ ] Etappe 4: PWA-Icons als PNG (192/512) erzeugen, Mobil-Feinschliff,
  `/impeccable init` für `PRODUCT.md`/`DESIGN.md`.
- [ ] Phase C/D: PM2-Prozess `voitex-web` als `torsten`, `data/` im Backup prüfen.
- [ ] Backend muss das gebaute Frontend selbst ausliefern (nginx leitet alle
  Pfade an 3006 weiter, siehe `AGENTS.md` → Deployment); multer-Limit (100 MB)
  an nginx (200 MB) angleichen.
- [x] Phase E: nginx `voitex-tailnet.conf`, Caddy, authentik, DNS eingerichtet
  (Mensch, 26.10.2026); `https://voitex.pmsuite.eu` leitet auf authentik um.
  Änderungen daran nur über den Menschen.

---

## 4 — Aktive Entscheidungen (Kurzform)
<!-- Nur was JETZT noch relevant ist. Sobald eine Entscheidung
     abgeschlossen/überholt ist → ab nach DECISIONS_LOG.md. -->

- 261026: Stack wie V2T (React + Vite PWA, Node/Express, PM2, nginx) — sonst wird der Umbau zu umfangreich.
- 261026: Keine Daten aus V2T übernehmen; Betrieb als `torsten`, kein Service-Account.
- 261026: V2T bleibt bis auf Fixes unverändert und läuft parallel weiter.
- 261026: Kein Tailwind (Voitex-Klassen in plain CSS), `lucide-react` als einzige neue Runtime-Dependency.
- 261026: Overlay-Leiste wie Voitex ist der Aufnahme-Einstieg für Diktate; Darstellung (Theme) pro Gerät, nicht serverseitig.

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
