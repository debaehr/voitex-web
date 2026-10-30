import { useRef, useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { api } from "../lib/api";
import { checkMessage, defaultModel, modelRows, pairKey, providerLabels, uniqueChecks, updateModelRow, type ModelRow, type RowCheck } from "../lib/model-settings";
import type { ModelSelection, ProviderId, Providers, Settings } from "../lib/types";
import { ProviderOptions } from "./ProviderOptions";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Select } from "./ui";

export function ProviderModelsCard({ settings, providers, onChange }: { settings: Settings; providers?: Providers; onChange: (settings: Settings) => void }) {
  const [checking, setChecking] = useState(false);
  const [checks, setChecks] = useState<Record<string, RowCheck>>({});
  const [checkedAt, setCheckedAt] = useState("");
  const [error, setError] = useState("");
  const revisions = useRef<Record<string, number>>({});
  const running = useRef(false);
  const rows = modelRows(settings, providers);
  const activeChecks = rows.flatMap(row => {
    const check = checks[row.id];
    return check && check.pair === pairKey(row.selection) ? [{ row, ...check }] : [];
  });
  const problems = [...new Map(activeChecks.filter(check => !check.result.ok).map(check => [check.pair, check.result])).values()];
  function change(row: ModelRow, selection: ModelSelection | null) {
    const next = updateModelRow(settings, row.id, selection, providers);
    const nextRows = modelRows(next, providers);
    const changed = rows.filter(old => pairKey(old.selection) !== pairKey(nextRows.find(item => item.id === old.id)?.selection));
    const invalidated = { ...checks };
    for (const item of changed) { revisions.current[item.id] = (revisions.current[item.id] ?? 0) + 1; delete invalidated[item.id]; }
    setChecks(invalidated); setError(""); onChange(next);
  }
  async function check() {
    if (running.current) return;
    running.current = true; setChecking(true); setError("");
    const snapshot = rows;
    const versions = { ...revisions.current };
    try {
      const { results } = await api.checkProviders(uniqueChecks(snapshot));
      const next: Record<string, RowCheck> = {};
      for (const row of snapshot) {
        const result = results.find(item => pairKey(item) === pairKey(row.selection));
        // A response for an edited row must not restore its expired status.
        if (result && versions[row.id] === revisions.current[row.id]) next[row.id] = { pair: pairKey(row.selection), result };
      }
      setChecks(next);
      setCheckedAt(new Intl.DateTimeFormat("de", { hour: "2-digit", minute: "2-digit" }).format(new Date()));
    } catch { setError("Verbindungstest fehlgeschlagen. Bitte erneut versuchen."); }
    finally { running.current = false; setChecking(false); }
  }
  function renderRow(row: ModelRow) {
    const selection = row.selection;
    const provider = selection?.provider;
    const listed = provider ? providers?.models?.[provider]?.[row.task] ?? [{ id: defaultModel(provider, row.task, providers) }] : [];
    const options = listed.filter(model => !(row.fallback && provider === row.primary?.provider && model.id === row.primary?.model));
    const availableModel = options.some(model => model.id === selection?.model);
    const result = checks[row.id]?.pair === pairKey(selection) ? checks[row.id]?.result : undefined;
    const accessibleLabel = row.id === "protocol" || row.id === "summary" ? row.label : `${row.task === "meetings" ? "Meetings" : "Diktat"} ${row.label}`;
    return <div className="provider-model-row" key={row.id}>
      <label className="provider-model-label" htmlFor={`provider-${row.id}`}>{row.label}</label>
      <Select id={`provider-${row.id}`} aria-label={`${accessibleLabel}: Anbieter`} title={provider ? providerLabels[provider] : "Keine"} value={provider ?? "none"} onChange={event => {
        const selected = event.target.value as ProviderId | "none";
        if (selected === "none") { change(row, null); return; }
        const model = defaultModel(selected, row.task, providers);
        const alternate = providers?.models?.[selected]?.[row.task]?.find(item => item.id !== row.primary?.model)?.id;
        change(row, { provider: selected, model: row.fallback && selected === row.primary?.provider && model === row.primary.model ? alternate ?? model : model });
      }}>
        {row.fallback && <option value="none">Keine</option>}
        <ProviderOptions available={row.providers} selected={provider ?? ""} invalid={providers?.invalid} />
      </Select>
      <Select id={`model-${row.id}`} aria-label={`${accessibleLabel}: Modell`} title={selection?.model} value={selection?.model ?? ""} disabled={!selection}
        onChange={event => { if (selection) change(row, { ...selection, model: event.target.value }); }}>
        {!selection ? <option value="">—</option> : <>
          {!availableModel && <option value={selection.model}>{selection.model} (nicht mehr angeboten)</option>}
          {options.map(model => <option key={model.id} value={model.id}>{model.id}{model.default ? " (Standard)" : ""}</option>)}
        </>}
      </Select>
      <span className="provider-model-status" role="status" aria-label={result ? `${row.affected}: ${result.ok ? "Erreichbar" : checkMessage(result.reason)}` : `${row.affected}: Nicht geprüft`}>
        {result && (result.ok ? <Check aria-hidden /> : <TriangleAlert aria-hidden className="form-error" />)}
      </span>
      {row.fallback && selection && ["openai", "assemblyai", "groq"].includes(selection.provider) &&
        <p className="field-hint provider-model-hint">Bei Ausweiche geht das Audio an einen US-Anbieter.</p>}
    </div>;
  }
  const meetingIndex = rows.findIndex(row => row.id === "meetings");
  const currentCount = rows.filter(row => row.selection).length;
  return <Card className="provider-model-card">
    <CardHeader><CardTitle>Anbieter und Modelle</CardTitle><CardDescription>Die API-Schlüssel liegen auf dem Server, nicht im Browser.</CardDescription></CardHeader>
    <CardContent>
      <section className="provider-model-group" aria-labelledby="dictation-models-title">
        <h3 id="dictation-models-title">Diktat</h3>
        {rows.slice(0, 2).map(renderRow)}
        <h4>Nachbearbeitung je Modus</h4>
        {rows.slice(2, meetingIndex).map(renderRow)}
      </section>
      <section className="provider-model-group" aria-labelledby="meeting-models-title">
        <h3 id="meeting-models-title">Meetings und Transkript-Upload</h3>
        {rows.slice(meetingIndex).map(renderRow)}
      </section>
      <div className="stack provider-check-results">
        <div><Button variant="outline" disabled={checking} onClick={() => void check()}>{checking ? "Prüfe …" : "Verbindung prüfen"}</Button></div>
        <div aria-live="polite">
          {error && <p className="form-error" role="alert">{error}</p>}
          {!!problems.length ? <><p className="form-error">⚠ {problems.length} Probleme</p><ul className="provider-check-problems">{problems.map(result => <li key={pairKey(result)}>
            {providerLabels[result.provider]} · {result.model}: {checkMessage(result.reason)}. Betrifft: {activeChecks.filter(check => check.pair === pairKey(result)).map(check => check.row.affected).join(", ")}
          </li>)}</ul></> : currentCount > 0 && activeChecks.length === currentCount && checkedAt ? <p className="field-hint">Alle Anbieter erreichbar · geprüft {checkedAt}</p> : null}
        </div>
      </div>
    </CardContent>
  </Card>;
}
