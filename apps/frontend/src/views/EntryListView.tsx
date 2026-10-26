import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Dialog } from "../components/Dialog";
import { Button, Card, Field, Input, Select, Textarea } from "../components/ui";
import { SettingsNotice, useSettings } from "../lib/settings-context";
import {
  exportLexiconCsv,
  findDuplicateSpoken,
  mergeImported as mergeLexicon,
  parseLexiconCsv,
} from "../lib/lexicon";
import {
  exportSnippetsJson,
  findDuplicateTrigger,
  mergeImported as mergeSnippets,
  normalizeTrigger,
  parseSnippetsJson,
} from "../lib/snippets";
import { downloadFile } from "../lib/download";
import type { Settings } from "../lib/types";
import { EmptyCard, ListPage } from "./ListPage";
interface Entry {
  id: string;
  first: string;
  second: string;
}
export function EntryListView({ kind }: { kind: "lexicon" | "snippets" }) {
  const lexicon = kind === "lexicon";
  const { settings, status, saving, save } = useSettings();
  const confirmed = useRef(settings);
  confirmed.current = settings;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"first" | "second">(
    lexicon ? "second" : "first",
  );
  const [ascending, setAscending] = useState(true);
  const [editing, setEditing] = useState<Entry | null | undefined>(undefined);
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = saving || importing;
  const disabled = status !== "ready" || busy;
  const entries: Entry[] = lexicon
    ? (settings?.lexicon ?? []).map(({ id, spoken, correct }) => ({
        id,
        first: spoken,
        second: correct,
      }))
    : (settings?.snippets ?? []).map(({ id, trigger, text }) => ({
        id,
        first: trigger,
        second: text,
      }));
  const needle = query.trim().toLocaleLowerCase("de-DE");
  const visible = entries
    .filter((entry) =>
      `${entry.first} ${entry.second}`
        .toLocaleLowerCase("de-DE")
        .includes(needle),
    )
    .sort(
      (a, b) =>
        a[sortBy].localeCompare(b[sortBy], "de-DE") * (ascending ? 1 : -1),
    );
  function open(entry: Entry | null) {
    setEditing(entry);
    setFirst(entry?.first ?? "");
    setSecond(entry?.second ?? "");
    setError("");
    setNotice("");
  }
  function close() {
    if (!busy) {
      setEditing(undefined);
      setError("");
    }
  }
  function message(reason: unknown) {
    return reason instanceof Error
      ? reason.message
      : "Speichern fehlgeschlagen. Bitte erneut versuchen.";
  }
  async function persist(next: Settings, success: string) {
    try {
      await save(next);
      setEditing(undefined);
      setNotice(success);
      setError("");
    } catch (reason) {
      setError(message(reason));
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const current = confirmed.current;
    if (!current || disabled) return;
    if (!second.trim() || (!lexicon && !normalizeTrigger(first))) {
      setError(
        lexicon
          ? "Richtig geschrieben ist erforderlich."
          : "Schlüsselwort und Text sind erforderlich.",
      );
      return;
    }
    const duplicate = lexicon
      ? findDuplicateSpoken(current.lexicon, first, editing?.id)
      : findDuplicateTrigger(current.snippets, first, editing?.id);
    if (duplicate) {
      setError(
        lexicon
          ? "Dieser „Klingt wie“-Wert ist bereits vorhanden."
          : "Dieses Schlüsselwort ist bereits vorhanden.",
      );
      return;
    }
    const id = editing?.id ?? crypto.randomUUID();
    // Only the collection changes; prompts and providers come from confirmed settings.
    const next = lexicon
      ? {
          ...current,
          lexicon: [
            ...current.lexicon.filter((row) => row.id !== id),
            { id, spoken: first.trim(), correct: second.trim() },
          ],
        }
      : {
          ...current,
          snippets: [
            ...current.snippets.filter((row) => row.id !== id),
            { id, trigger: first.trim(), text: second },
          ],
        };
    void persist(
      next,
      lexicon ? "Lexikoneintrag gespeichert." : "Snippet gespeichert.",
    );
  }
  function remove() {
    const current = confirmed.current;
    if (!current || !editing || disabled) return;
    void persist(
      lexicon
        ? {
            ...current,
            lexicon: current.lexicon.filter((row) => row.id !== editing.id),
          }
        : {
            ...current,
            snippets: current.snippets.filter((row) => row.id !== editing.id),
          },
      "Eintrag gelöscht.",
    );
  }
  async function importFile(file: File) {
    if (disabled) return;
    setImporting(true);
    setError("");
    setNotice("");
    try {
      const content = await file.text();
      const current = confirmed.current;
      if (!mounted.current || !current) return;
      let added: number, skipped: number;
      // Validate the complete file before writing either collection.
      if (lexicon) {
        const merged = mergeLexicon(current.lexicon, parseLexiconCsv(content));
        ({ added, skipped } = merged);
        if (added) await save({ ...current, lexicon: merged.entries });
      } else {
        const merged = mergeSnippets(
          current.snippets,
          parseSnippetsJson(content),
        );
        ({ added, skipped } = merged);
        if (added) await save({ ...current, snippets: merged.entries });
      }
      setNotice(`${added} hinzugefügt, ${skipped} übersprungen`);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setImporting(false);
    }
  }
  function exportFile() {
    if (!settings) return;
    try {
      if (lexicon)
        downloadFile(
          "voitex-lexikon.csv",
          exportLexiconCsv(settings.lexicon),
          "text/csv;charset=utf-8",
        );
      else
        downloadFile(
          "voitex-snippets.json",
          exportSnippetsJson(settings.snippets),
          "application/json;charset=utf-8",
        );
    } catch {
      setError("Export fehlgeschlagen. Bitte erneut versuchen.");
    }
  }
  return (
    <ListPage
      query={query}
      onQueryChange={setQuery}
      disabled={disabled}
      sortControl={
        <Select
          className="list-sort"
          aria-label="Sortieren nach"
          value={sortBy}
          onChange={(event) =>
            setSortBy(event.target.value as "first" | "second")
          }
        >
          <option value={lexicon ? "second" : "first"}>
            {lexicon ? "Korrektes Wort" : "Schlüsselwort"}
          </option>
          <option value={lexicon ? "first" : "second"}>
            {lexicon ? "Klingt wie" : "Text"}
          </option>
        </Select>
      }
      onToggleOrder={() => setAscending((value) => !value)}
      onImport={() => fileInput.current?.click()}
      onExport={entries.length ? exportFile : undefined}
      onAdd={() => open(null)}
      hint={
        lexicon
          ? `${entries.length} Einträge · Korrekturen gelten für Diktate und Meetings.`
          : `${entries.length} Snippets · Das ganze Diktat muss das Schlüsselwort sein; der Text wird dann ohne Umschreiben eingefügt.`
      }
    >
      <input
        hidden
        type="file"
        accept={lexicon ? ".csv,text/csv" : ".json,application/json"}
        ref={fileInput}
        aria-label={lexicon ? "Lexikon importieren" : "Snippets importieren"}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importFile(file);
        }}
      />
      <SettingsNotice />
      {notice && <p role="status">{notice}</p>}
      {importing && <p role="status">Import wird gelesen …</p>}
      {error && editing === undefined && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {status === "ready" &&
        (entries.length === 0 ? (
          <EmptyCard
            title={lexicon ? "Noch keine Einträge" : "Keine Snippets vorhanden"}
            text={
              lexicon
                ? "Trage Eigennamen und Fachbegriffe ein, die die Spracherkennung falsch schreibt."
                : "Erstelle Textbausteine für häufig verwendete Phrasen. Sage einfach das Schlüsselwort, und der Text wird eingefügt."
            }
            action={
              <Button disabled={disabled} onClick={() => open(null)}>
                {lexicon
                  ? "Ersten Eintrag anlegen"
                  : "Erstes Snippet erstellen"}
              </Button>
            }
          />
        ) : (
          <Card className="list-card">
            <div className="list-head">{lexicon ? "Eintrag" : "Snippet"}</div>
            {visible.length ? (
              visible.map((entry) => (
                <button
                  type="button"
                  className="list-row list-row-button"
                  key={entry.id}
                  disabled={disabled}
                  onClick={() => open(entry)}
                >
                  {entry.first ? (
                    <>
                      <span className="code-chip">{entry.first}</span>
                      {lexicon && (
                        <ArrowRight size={16} aria-hidden className="muted" />
                      )}
                    </>
                  ) : null}
                  {lexicon ? (
                    <strong>{entry.second}</strong>
                  ) : (
                    <span className="snippet-preview">{entry.second}</span>
                  )}
                </button>
              ))
            ) : (
              <p className="list-no-results">Keine Treffer für „{query}“.</p>
            )}
          </Card>
        ))}
      {editing !== undefined && (
        <Dialog
          title={
            lexicon
              ? editing
                ? "Lexikoneintrag bearbeiten"
                : "Lexikoneintrag anlegen"
              : editing
                ? "Snippet bearbeiten"
                : "Snippet anlegen"
          }
          onClose={close}
        >
          <form onSubmit={submit}>
            <fieldset disabled={busy} className="form-fields stack">
              <Field
                label={lexicon ? "Klingt wie" : "Schlüsselwort"}
                htmlFor="entry-first"
                hint={
                  lexicon
                    ? "Optional. Ohne diesen Wert dient das Wort als Hinweis für die Spracherkennung."
                    : undefined
                }
              >
                <Input
                  id="entry-first"
                  value={first}
                  onChange={(event) => {
                    setFirst(event.target.value);
                    setError("");
                  }}
                  required={!lexicon}
                />
              </Field>
              <Field
                label={lexicon ? "Richtig geschrieben" : "Text"}
                htmlFor="entry-second"
              >
                {lexicon ? (
                  <Input
                    id="entry-second"
                    value={second}
                    onChange={(event) => {
                      setSecond(event.target.value);
                      setError("");
                    }}
                    required
                  />
                ) : (
                  <Textarea
                    id="entry-second"
                    value={second}
                    onChange={(event) => {
                      setSecond(event.target.value);
                      setError("");
                    }}
                    required
                  />
                )}
              </Field>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
            </fieldset>
            <div className="dialog-actions">
              {editing && (
                <Button
                  className="delete-action"
                  variant="destructive"
                  disabled={busy}
                  onClick={remove}
                >
                  Löschen
                </Button>
              )}
              <Button variant="outline" disabled={busy} onClick={close}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={busy}>
                {saving
                  ? "Wird gespeichert …"
                  : editing
                    ? "Speichern"
                    : "Anlegen"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </ListPage>
  );
}
