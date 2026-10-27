# Verifikation — Etappe 2 (F-005, F-008–F-011) und F-012

Stand: 27.10.2026 · Lead: Claude Opus 5.5 · Umsetzung: Codex `gpt-6.1-sol` (medium)

## Automatisch (A1–A3)

- `pnpm check`, `pnpm build` grün; `pnpm test`: Backend 112, Frontend 72 Tests grün
  (Stand Commit `fd0312b`).
- Modell je Lauf im Codex-Sitzungsprotokoll nachgewiesen (`"model":"gpt-6.1-sol"`).

## Betrieb

- PM2-Prozess `voitex-web` (torsten) im systemd-Dienst `pm2-torsten`, nur `127.0.0.1:3006`.
- `/api/health` → `{"ok":true}`; SPA-Fallback liefert den aktuellen Build.
- `/api/translate` live gegen OpenAI: „Guten Morgen, wie geht es dir?“ → HR
  „Dobro jutro, kako si?“; `targetLanguage: "fr"` → 400.

## Am Effekt (A4, Mensch)

- 27.10.2026: Live-Abnahme auf `https://voitex.pmsuite.eu` durch den Menschen —
  Diktat, Verlauf, Lexikon, Snippets, Einstellungen und Übersetzer funktionieren
  („Scheint alles zu funktionieren“).
- Befunde der ersten Abnahme umgesetzt in `9e54f97` (Menü-Umbenennung, Modi-Seite,
  Kroatisch, Hinweisbox entfernt, Aufnahmeknopf Meetings deaktiviert).

## Bekannte Grenzen

- LLM-Ausgabe auf 1200 Tokens begrenzt; lange Diktate können abgeschnitten werden
  (Etappe 3: `max_tokens` je Aufgabe).
