import { ArrowUpDown, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TwoLevel } from "../components/TwoLevel";
import { ConfirmDialog } from "../components/Dialog";
import { Button, Card, CardContent, Field, Input } from "../components/ui";
import { useHistory } from "../lib/history-context";
import { useSettings } from "../lib/settings-context";
import { findDuplicateSpoken } from "../lib/lexicon";
import { exportHistory, filterHistory, modeLabels, resultMeta, sortHistory } from "../lib/history";
import { readPreference, writePreference } from "../lib/device-preferences";

export function HistoryView() {
  const history = useHistory();
  const { settings, save, status, saving } = useSettings();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newestFirst, setNewestFirst] = useState(() => readPreference("voitex-history-sort", ["newest", "oldest"], "newest") === "newest");
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<{ id: string } | "all" | null>(null);
  const [correct, setCorrect] = useState("");
  const [spoken, setSpoken] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number>();
  const deleting = useRef(false);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);
  useEffect(() => { writePreference("voitex-history-sort", newestFirst ? "newest" : "oldest"); }, [newestFirst]);
  const ordered = sortHistory(filterHistory(history.entries, search), newestFirst);
  const active = ordered.find(entry => entry.id === activeId) ?? null;
  async function copy() {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(active.text);
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch { setNotice("Kopieren nicht möglich — Text unten kopieren"); }
  }
  async function addTerm(event: React.FormEvent) {
    event.preventDefault();
    if (!settings || status !== "ready" || saving || !correct.trim()) return;
    if (findDuplicateSpoken(settings.lexicon, spoken)) {
      setNotice("Dieser Eintrag für „Klingt wie“ existiert bereits."); return;
    }
    try {
      await save({ ...settings, lexicon: [...settings.lexicon, { id: crypto.randomUUID(), correct: correct.trim(), spoken: spoken.trim() }] });
      setCorrect(""); setSpoken(""); setNotice("Begriff zum Lexikon hinzugefügt.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Speichern fehlgeschlagen."); }
  }
  async function deleteConfirmed() {
    if (!confirm || deleting.current) return;
    deleting.current = true;
    try {
      if (confirm === "all") await history.clear();
      else await history.remove(confirm.id);
      setConfirm(null);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Löschen fehlgeschlagen."); setConfirm(null); }
    finally { deleting.current = false; }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([exportHistory(history.entries)], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = "voitex-verlauf.txt"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const empty = history.status === "error" ? "Verlauf konnte nicht geladen werden" :
    history.status === "loading" ? "Verlauf wird geladen …" :
    history.entries.length === 0 ? "Noch keine Diktate im Verlauf." :
    ordered.length === 0 ? "Keine passenden Einträge." : "Links einen Eintrag wählen.";
  return <>
    {confirm ? <ConfirmDialog title={confirm === "all" ? "Gesamten Verlauf löschen?" : "Eintrag löschen?"}
      confirmLabel="Löschen" onClose={() => { if (!deleting.current) setConfirm(null); }} onConfirm={() => { void deleteConfirmed(); }}>
      {confirm === "all" ? "Alle Diktate werden unwiderruflich gelöscht." : "Dieses Diktat wird unwiderruflich gelöscht."}
    </ConfirmDialog> : null}
    <TwoLevel
      entries={ordered.map(entry => ({
        id: entry.id, title: modeLabels[entry.mode], subtitle: entry.text,
        badge: <span className="mono text-xs muted">{new Date(entry.createdAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>,
        onDelete: history.busy ? undefined : () => setConfirm({ id: entry.id }),
      }))}
      activeId={active?.id ?? null}
      onSelect={id => { setActiveId(id); setCopied(false); setNotice(null); setCorrect(""); setSpoken(""); }}
      onBack={() => setActiveId(null)}
      bandHead={<div className="stack" style={{ gap: 6 }}>
        <div className="row between">
          <span className="field-hint">{history.entries.length} Einträge</span>
          <div className="row" style={{ gap: 4 }}>
            <Button variant="ghost" size="sm" disabled={history.status !== "ready" || !history.entries.length} onClick={download}>Exportieren</Button>
            <Button variant="ghost" size="sm" disabled={history.status !== "ready" || !history.entries.length || history.busy}
              style={{ color: "var(--destructive)" }} onClick={() => setConfirm("all")}>Alles löschen</Button>
          </div>
        </div>
        <Input aria-label="Verlauf durchsuchen" placeholder="Verlauf durchsuchen" value={search} onChange={event => setSearch(event.target.value)} />
        <Button variant="ghost" size="sm" onClick={() => setNewestFirst(value => !value)} style={{ justifyContent: "flex-start" }}>
          <ArrowUpDown /> {newestFirst ? "Neueste zuerst" : "Älteste zuerst"}
        </Button>
        {history.error ? <p role="alert" className="data-notice">{history.error}</p> : null}
        {notice ? <p role="status" className="data-notice">{notice}</p> : null}
      </div>}
      empty={empty}
    >
      {active ? <Card><CardContent style={{ paddingTop: 20 }}>
        <div className="row between">
          <span className="muted">{resultMeta(active)}</span>
          <span className="muted text-xs">{new Date(active.createdAt).toLocaleString("de-DE")}</span>
        </div>
        <div className="stack" style={{ gap: 4 }}>
          <span className="section-label">Endtext</span>
          <p style={{ whiteSpace: "pre-wrap", fontSize: 15 }}>{active.text}</p>
        </div>
        <div className="row"><Button variant="outline" onClick={() => { void copy(); }}><Copy />{copied ? "Kopiert" : "Kopieren"}</Button></div>
        {notice ? <p role="status" className="data-notice">{notice}</p> : null}
        <hr className="divider" />
        <form className="stack" onSubmit={event => { void addTerm(event); }}>
          <span className="section-label">Begriff ins Lexikon</span>
          <Field label="Richtig geschrieben" htmlFor="history-correct"><Input id="history-correct" required value={correct} onChange={event => setCorrect(event.target.value)} /></Field>
          <Field label="Klingt wie" hint="Optional" htmlFor="history-spoken"><Input id="history-spoken" value={spoken} onChange={event => setSpoken(event.target.value)} /></Field>
          <div><Button type="submit" variant="secondary" disabled={status !== "ready" || saving || !correct.trim()}>Hinzufügen</Button></div>
        </form>
        <div><Button variant="destructive" disabled={history.busy} onClick={() => setConfirm({ id: active.id })}>Diesen Eintrag löschen</Button></div>
      </CardContent></Card> : null}
    </TwoLevel>
  </>;
}
