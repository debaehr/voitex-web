# Lauf 9 — Delegationsergebnis

Stand: 30.10.2026 · Codex · Ziel: `main` in `/opt/voitex-web`.
Auftrag: `2026-10-30-modelle-verbindungstest.md`, Abschnitte 1–5.

## Lieferumfang

- Karte „Anbieter und Modelle“ mit Diktat-STT, optionaler Ausweiche, Textmodell je sichtbarem Standard-/eigenem Modus sowie Meeting-STT, Ausweiche, Protokoll und Zusammenfassung.
- Anbieter-/Modell-/Statusspalten; Beschriftung oberhalb bei Kartenbreite bis 560 px. Gespeicherte Modelle außerhalb der Liste bleiben sichtbar. US-Hinweise bei entsprechender Audio-Ausweiche.
- `GET /api/providers` liefert zusätzlich `models[provider][stt|chat|meetings]`. Aktualisierung bei der bestehenden Schlüsselprüfung zum Start und alle sechs Stunden; kuratierte Vorschläge bei Fehlern, heutige/env-definierte Standards immer enthalten.
- Mistral nach Fähigkeiten/Aufgabe gefiltert, Meetings nur `*-transcribe-*` ohne Realtime. OpenAI-Textfamilien GPT-4o, GPT-4.1, GPT-5 und o1/o3/o4 über Responses ohne `temperature` oder Chat-only-Parameter; Anthropic `claude-*`; AssemblyAI feste Liste.
- Mistral/OpenAI/Anthropic/AssemblyAI-Aufrufe verwenden die gewählte Modell-ID. Textmodelle des aktiven Modus gelten auch für Übersetzungen. Groq behält seine bisherigen Modelle, einschließlich `whisper-large-v3`.
- Diktat-Ausweiche im Backend bei Netzwerk, Timeout, 401/403, 429 und 5xx; keine Ausweiche bei 400/413/415. Lexikon-Kontext für beide Versuche. Ergebnis und Verlauf erhalten `sttProvider` und `sttModel`; die Metadaten zeigen die tatsächlich verwendete STT-Kombination.
- `POST /api/providers/check` validiert maximal 30 Kombinationen, fragt feste kostenlose GET-Endpunkte parallel mit je 10 Sekunden Zeitlimit ab und gibt nur sichere Gründe zurück. Redirects sind untersagt; 401/403 aktualisieren den Schlüsselstatus.
- Desktop-Menü mit 56-px-Symbolleiste, Tooltips, zugänglichen Namen, `aria-expanded`, lokaler Speicherung mit try/catch und Standard eingeklappt unter 1100 px. Reduzierte Bewegung ohne Übergang; mobile Tab-Leiste erhalten.

## Neue Settings-Form

Additive Felder; `version: 1`, `providers`, `meetingFallback` und alle bisherigen Daten bleiben lesbar:

```json
{
  "models": {
    "original": "mistral-large-latest",
    "casual": "mistral-large-latest",
    "formal": "mistral-large-latest",
    "coding": "mistral-large-latest",
    "protocol": "mistral-large-latest",
    "summary": "mistral-large-latest"
  },
  "dictationStt": { "provider": "mistral", "model": "voxtral-mini-latest" },
  "dictationFallback": null,
  "meetingStt": { "provider": "mistral", "model": "voxtral-mini-transcribe-3" },
  "meetingSttFallback": null
}
```

`models` verwendet für eigene Modi deren stabile ID als Schlüssel. Jede Ausweiche ist `null` oder `{ provider, model }`; Meeting-Ausweiche nur AssemblyAI. Die Oberfläche führt die bisherigen Anbieterfelder und den alten Meeting-Schalterwert beim Bearbeiten weiterhin mit.

Fehlende Felder werden ausschließlich im Speicher abgeleitet: Diktat-STT aus `providers.original` und der bisherigen Claude-STT-Regel, Diktat-Ausweiche aus, Meeting-STT aus `providers.meetings`, Meeting-Ausweiche AssemblyAI genau bei altem `meetingFallback === true`, Textmodelle aus den bisherigen Standards. Explizites `meetingSttFallback: null` hat Vorrang vor dem alten Schalter. Die drei Modell-Umgebungsvariablen bleiben maßgeblich. `GET /settings` schreibt alte Dateien nicht um; die vorhandene atomische Schreib-/Backup-Logik bleibt erhalten.

Modell-IDs: String, 1–100 Zeichen, `/^[A-Za-z0-9._:-]+$/`; keine Bindung an die aktuelle Modellliste. Anbieter werden ohne Typumwandlung validiert.

## Verifikation

Im Zielrepository ausgeführt:

- `pnpm check`: grün, beide Workspaces.
- `pnpm test`: **729 Tests grün**, Backend **439 in 16 Dateien**, Frontend **290 in 26 Dateien**.
- `pnpm build`: grün, beide Workspaces.
- `git diff --check`: grün.

Neue A1-Tests: `model-settings.test.ts` (8), `provider-check.test.ts` (10), `model-routing.test.ts` (33); zusätzlich zwei Meeting-Job-Tests in `meetings.test.ts`. A1 nutzt gemocktes fetch, einschließlich echter SDK-Adapter, Ausweiche in beide Richtungen, Grenz-/Fehlerfälle und sichere HTTP-Antworten.

Neue A2-Tests: `provider-models.test.tsx` (9), `sidebar.test.tsx` (7). Bestehende Tests auf die additive Antwort-/Settings-Form und die eigenständige STT-Wahl angepasst.

Browserprüfung mit synthetischen Daten und vollständig gemockter API: 1440 px hell, 1000 px mit Symbolleiste, 390 px dunkel; zusätzlich 800 und 768 px mit ausdrücklich offenem Menü. Keine JavaScript-Fehler, mobil kein horizontaler Überlauf. Unabhängiger Impeccable-Review fand zwei Randfälle (Statusüberlappung und unvollständige zugängliche Namen); beide korrigiert, im begrenzten Verdict-Pass als erledigt bestätigt (`ship`, nur diese beiden Befunde). Der Detector meldet ausschließlich Layout-Animationswarnungen für den vorhandenen Pegel und die hier vorgesehene Sidebar-Breite.

Temporäre Nachweise: `/tmp/voitex-lauf9-review/`, `/tmp/voitex-visual-result-final.json`, `/tmp/voitex-final-{check,test,build}.log`.

## Abweichungen und Übergabe

Keine funktionalen Abweichungen vom freigegebenen Umfang. Kein Commit, kein Push, kein PM2-Neustart, keine neuen Dependencies; `apps/backend/.env` und Laufzeitdaten wurden nicht verändert. Die Sandbox erforderte zunächst eine isolierte Arbeitskopie; alle genannten Änderungen wurden anschließend ins Zielrepository übernommen und dort geprüft.

A4 bleibt beim Lead/Menschen: echte Modelllisten und Schlüssel, Verbindungstest/Gegenprobe, reale Diktate mit beiden STT-Anbietern, erzwungene Ausweiche und Geräteabnahme. Der private UI-Artefakt-Link wurde nicht aufgerufen; Struktur und Anordnung folgen der schriftlichen Spezifikation. SESSION.md und Feature-Status führt gemäß Delegationsregel der Lead; dieser Bericht ist die Übergabe.

## Geänderte Dateien

37 Quellcode-/Testdateien sowie dieser Bericht:

- `apps/backend/src/meetings.ts`
- `apps/backend/src/model-settings.ts`
- `apps/backend/src/providers/anthropic.ts`
- `apps/backend/src/providers/assemblyai.ts`
- `apps/backend/src/providers/check.ts`
- `apps/backend/src/providers/key-status.ts`
- `apps/backend/src/providers/meetings.ts`
- `apps/backend/src/providers/mistral.ts`
- `apps/backend/src/providers/models.ts`
- `apps/backend/src/providers/openai.ts`
- `apps/backend/src/providers/shared.ts`
- `apps/backend/src/routes/api.ts`
- `apps/backend/test/app.test.ts`
- `apps/backend/test/meeting-providers.test.ts`
- `apps/backend/test/meetings.test.ts`
- `apps/backend/test/model-routing.test.ts`
- `apps/backend/test/model-settings.test.ts`
- `apps/backend/test/provider-check.test.ts`
- `apps/frontend/src/App.tsx`
- `apps/frontend/src/components/ProviderModelsCard.tsx`
- `apps/frontend/src/components/ProviderOptions.tsx`
- `apps/frontend/src/lib/api.ts`
- `apps/frontend/src/lib/dictation.ts`
- `apps/frontend/src/lib/history.ts`
- `apps/frontend/src/lib/model-settings.ts`
- `apps/frontend/src/lib/settings-store.ts`
- `apps/frontend/src/lib/settings.ts`
- `apps/frontend/src/lib/sidebar.ts`
- `apps/frontend/src/lib/types.ts`
- `apps/frontend/src/styles.css`
- `apps/frontend/src/views/SettingsView.tsx`
- `apps/frontend/test/data.test.ts`
- `apps/frontend/test/modes.test.tsx`
- `apps/frontend/test/provider-models.test.tsx`
- `apps/frontend/test/run3b.test.tsx`
- `apps/frontend/test/settings-store.test.ts`
- `apps/frontend/test/sidebar.test.tsx`
- `specs/changes/2026-10-30-modelle-verbindungstest-result.md`
