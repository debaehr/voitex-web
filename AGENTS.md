
## Deployment

- The app listens on `127.0.0.1:3006` only. Never bind to `0.0.0.0` and do not
  choose another port.
- Public access only via `https://voitex.pmsuite.eu`: edge-01 (Caddy, TLS) →
  authentik forward auth → tool-01 nginx `voitex-tailnet.conf` on
  `100.109.76.36:8080` (allows edge-01 only) → app.
- nginx forwards every path to the app, so the backend serves the built
  frontend as well as `/api`.
- The app must not implement its own login. The authenticated user arrives in
  the `X-Authentik-Username` / `X-Authentik-Email` headers.
- Upload limit at nginx: 200 MB. Proxy read timeout: 300 s.

## Constraints / Nicht anfassen

- nginx-, Caddy- und authentik-Konfiguration werden nicht von Agenten
  geändert. Das geht über Torsten (Serververbund).
- Keine Zugangsdaten, Token oder Schlüssel versionieren; `.env` bleibt lokal.

## Session-Handoff-Protokoll

Dieses Projekt nutzt eine geteilte Datei `SESSION.md` als verbindlichen
Arbeitsstand über alle KI-Agenten und Maschinen hinweg. Der Handoff
zwischen verschiedenen Modellen und Werkzeugen läuft über diese Datei plus
Git, **nicht** über den Chatverlauf.

### Zu Sessionbeginn (PFLICHT, vor jeder anderen Aktion)

1. Lies `SESSION.md` **vollständig**. Sie hat Vorrang vor deinem Eindruck
   aus dem Chat. Wenn Chat und SESSION.md sich widersprechen, gilt SESSION.md.
2. Lies bei Bedarf `DECISIONS_LOG.md` für den Hintergrund früherer Entscheidungen.
3. Falls `SESSION.md` §6 offene Fragen an den Menschen enthält, die deinen
   Task blockieren: zuerst klären, nicht raten.

### Während der Arbeit

4. Triffst du eine relevante Architektur- oder Designentscheidung,
   ergänze sie sofort in `SESSION.md` §4 (Kurzform).
5. Ändert sich der Fokus (neuer Task, anderer Dateibereich), aktualisiere §1.

### Vor Sessionende UND vor jedem Werkzeug- oder Modellwechsel (PFLICHT)

6. Aktualisiere §1 (Aktueller Task), §2 (Letzter Stand), §3 (TODOs).
7. Setze die Update-Zeile oben: Zeitstempel `YYMMDD_HHMM`, dein Modellname,
   aktueller Branch, Node.
8. Verschiebe abgeschlossene oder überholte Einträge aus §4 nach `DECISIONS_LOG.md`.
9. Halte `SESSION.md` unter ~150 Zeilen. Sie ist ein Statusboard, kein Logbuch.
10. Committe `SESSION.md` mit eigener Message im Format: `session: <kurzbeschreibung>`.
11. **Pushe nach GitHub.** Ein nicht gepushter Stand erreicht den nächsten Node
    nicht — der Handoff läuft über das Fernziel, nicht über die lokale Platte.

Der Pre-Commit-Hook in `.githooks/pre-commit` blockiert Code-Commits ohne
gepflegte `SESSION.md`. Notausgang für bewusste Ausnahmen: `git commit --no-verify`.

### Sprache und Format in SESSION.md

- Fließtext und Beschreibungen: Deutsch.
- Bezeichner, Pfade, Funktions- und Testnamen, Commit-Messages: Original (meist Englisch).
- Konkret bleiben: `pfad/datei.ext:Zeile` statt „in der Auth-Logik irgendwo".

### Was NICHT in SESSION.md oder DECISIONS_LOG.md gehört

Beide Dateien werden mitversioniert und landen auf GitHub — auch bei privaten
Repositories.

- Keine Zugangsdaten, Token oder Passwörter, auch nicht als Beispiel
- Zurückhaltung bei Hostnamen, IP-Adressen und internen Pfaden
- Bei Auftragsarbeit: nichts, was der Auftraggeber nicht außer Haus sehen soll

Braucht ein Agent einen Zugangswert, verweist er auf den Ablageort
(„Passphrase in Bitwarden unter `<Eintrag>`"), nicht auf den Wert selbst.

### Warum das so streng ist

Du bist möglicherweise nicht derselbe Agent, der die nächste Session übernimmt.
Ein anderes Modell auf einem anderen Rechner liest nur, was in `SESSION.md`
steht. Was du nicht hineinschreibst, ist für den Nachfolger verloren.

## Feature-Status-Protokoll

Dieses Projekt führt `FEATURES.md` als langlebige Fortschritts-Verfolgung.
Sie ergänzt `SESSION.md`: SESSION.md sagt „wo stehen wir gerade", FEATURES.md
sagt „was soll gebaut werden und was ist davon fertig".

### Rollenverteilung (verbindlich)

- **Der Mensch besitzt die Feature-Einträge.** Nur er legt Features an,
  formuliert sie um oder entfernt sie.
- **Der Agent pflegt ausschließlich den Status.** Er erfindet keine Features,
  streicht keine und formuliert keine Titel um.

### Was der Agent tun soll

1. **Vor Arbeitsbeginn:** Prüfe in `FEATURES.md`, welches Feature ansteht.
   Setze dessen Status auf **in-arbeit** und nenne die Feature-ID in
   `SESSION.md` §1 (z. B. „Aktueller Task: F-042 Login-Flow").
2. **Nach Abschluss:** Erst wenn implementiert **und** verifiziert (Test/Build
   grün), Status auf **fertig** setzen. Nicht vorher.
3. **Bei einem Blocker:** Status auf **blockiert** setzen, Grund nach dem `·`
   eintragen, und den Blocker zusätzlich in `SESSION.md` §6 vermerken.
4. **Fehlt ein Feature**, das offensichtlich gebraucht wird: NICHT selbst
   anlegen. Als offene Frage in `SESSION.md` §6 notieren — der Mensch entscheidet.

### Grammatik (genau einhalten)

Eine Feature-Zeile hat exakt diese Form, sonst bricht der JSON-Export:

    - `F-001` Titel des Features — **status**

Status ist genau einer aus: `offen`, `in-arbeit`, `fertig`, `blockiert`,
`verworfen`. Bei `blockiert` folgt ` · Grund`. IDs sind stabil und werden nie
neu belegt.

### Grenze zu SESSION.md

- Statusänderung eines Features → `FEATURES.md`.
- Wo im Code du gerade steckst, Teilschritte, Notizen → `SESSION.md`.
- Feature-Status gehört **nicht** dupliziert in SESSION.md; dort nur die
  aktive Feature-ID als Verweis.

## Design-Qualitaet

Zwei Werkzeuge, getrennte Rollen. Impeccable gestaltet, Vercel prueft — nie umgekehrt.

- `/impeccable <beschreibung>` — neue Flaeche bauen
- `/impeccable critique <ziel>` — Design-Review mit Scoring
- `/impeccable polish <ziel>` — finaler Qualitaetsdurchgang
- `pruefe <pfad> mit web-design-guidelines` — unabhaengiges Gate vor dem Ship
- `npx impeccable detect <pfad>` — deterministischer Check, 59 Regeln

Projektkontext steht in `PRODUCT.md` und `DESIGN.md` (einmalig via `/impeccable init`).

Vor groesseren Aufraeumrunden: Funde aller drei Quellen sammeln und mit
`AUDIT_SORTIER_PROMPT.md` in Runden sortieren lassen. Read-only, keine Fixes
im selben Lauf.

## Arbeitsweise

- **Spec-getrieben:** `FEATURES.md` (Mensch) → `specs/F-xxx/spec.md` (Freigabe Mensch) →
  `plan.md` → testgetriebene Umsetzung → `verification.md` (Nachweis am Effekt).
  Kleine Korrekturen ohne fachliche Wirkung brauchen keinen Spec, wohl aber einen Test.
- **Code ist Englisch:** Bezeichner, Dateinamen, Kommentare, Commit-Messages, API- und
  Datenbanknamen. Deutsch nur in Fachdokumenten, `SESSION.md`, `DECISIONS_LOG.md`, Specs
  und in Oberflächentexten (über i18n, nie im Code hart verdrahtet).
- **Prüfen vor jedem Commit von Code:** die Prüfbefehle aus „Wichtige Befehle“ (Tests,
  Lint, Typprüfung). Solange dort keine stehen, ist das Anlegen der erste Auftrag.
- Subagenten sind erwünscht, wo Arbeit parallelisierbar ist oder eine unabhängige Prüfung
  hilft — Umsetzung über delegierte Läufe (siehe unten).

## Delegierte Läufe

Umsetzungsarbeit wird an einen anderen Agenten delegiert — ein Lead plant und prüft,
ein Worker setzt um. Ablauf, Modellwahl und Rückfall: `~/.claude/DELEGATION.md` und
`~/.claude/MODELLE.md`. Diese Regeln gelten für **beide Seiten** und jedes Werkzeug.

### Für den Lead

- **Ein delegierter Lauf startet kalt.** Das Briefing enthält: Ziel (1–2 Sätze),
  erlaubte und verbotene Dateien, prüfbare Abnahmekriterien, Verbote (kein Schema-Eingriff
  ohne Spec, keine neuen Abhängigkeiten ohne Freigabe, kein Commit), Rückmeldeform,
  Verweis auf `specs/F-xxx/spec.md`.
- **Was kritisch ist** (Modellwahl laut MODELLE.md), steht unter „Constraints / Nicht anfassen“.
- **Nie zwei Läufe in dieselben Dateien.** Parallel nur mit je eigenem `git worktree`.
- **Jedes Ergebnis wird geprüft, bevor es zählt:** Diff lesen, Prüfbefehle laufen lassen.
  „Der Lauf sagt, es funktioniert“ ist kein Nachweis.
- Der Lead führt `SESSION.md` und committet.

### Für den delegierten Lauf

- **Du committest nicht.** Der Lead prüft und committet.
- **Du fasst keine Infrastruktur an:** kein systemd, kein Docker außerhalb dieses Projekts,
  kein nginx, Caddy oder authentik, keine Backup-Konfiguration, kein Recreate der
  Produktivcontainer.
- **Du bleibst im Auftrag.** Funde melden, nicht nebenbei reparieren.
- **Keine Rückfragen während des Laufs** (Happier stürzt dabei ab): offene Fragen gehören
  ans Ende des Berichts.
- **Du legst keine Features an** und änderst keine Titel in `FEATURES.md`.
