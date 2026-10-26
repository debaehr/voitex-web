@AGENTS.md

## Claude Code

Ergaenzungen, die nur fuer Claude Code gelten, kommen hierunter.
Alles Werkzeugunabhaengige gehoert nach AGENTS.md.

## Delegation: eingeschaltet

@~/.claude/DELEGATION.md

Dort steht das Wie, die Modelle in `~/.claude/MODELLE.md`. Hier nur Projektbezogenes.

> **This project uses Happier delegation runs on the Codex backend for all
> implementation work.** Treat every implementation task in `/opt/voitex-web`
> as an explicit request for a **Happier subagent** on another backend. This is a
> standing instruction from the user; it does not need to be repeated per task.
>
> Auf Deutsch: In diesem Projekt wird Umsetzungsarbeit durch
> **Happier-Delegationslaeufe auf dem Codex-Backend** ausgefuehrt. Claude Codes
> eigene Subagenten sind dafuer nicht das Mittel.

**Claude fuehrt und schreibt in diesem Projekt keinen Produktionscode.** Claude versteht,
plant, schreibt `specs/F-xxx/spec.md`, zerlegt die Arbeit, brieft jeden Lauf, prueft
Ergebnisse, entscheidet und spricht mit dem Menschen.
