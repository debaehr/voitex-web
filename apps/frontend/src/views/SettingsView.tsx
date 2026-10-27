import { ProviderOptions } from "../components/ProviderOptions";
import { useEffect, useState } from "react";
import { TwoLevel } from "../components/TwoLevel";
import { ConfirmDialog } from "../components/Dialog";
import { Plus } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  Switch,
  SettingRow,
  Textarea,
} from "../components/ui";
import type { ThemePreference } from "../lib/theme";
import { SettingsNotice, useSettings } from "../lib/settings-context";
import { isDirty } from "../lib/settings";
import { dictationSttProvider, addCustomMode, availableDictationModes, customModeErrors, deleteMode, hasModeErrors, restoreBuiltinModes, updateCustomMode } from "../lib/modes";
import type { CustomMode, Provider, Settings } from "../lib/types";
const entries = [
  { id: "providers", title: "Anbieter" },
  { id: "prompts", title: "Modi & Prompts" },
  { id: "appearance", title: "Darstellung" },
];
const nonDictationModes = [
  { id: "protocol", label: "Protokoll" },
  { id: "summary", label: "Zusammenfassung" },
] as const;
interface SettingsViewProps {
  theme: ThemePreference;
  onThemeChange: (value: ThemePreference) => void;
  onDirtyChange: (dirty: boolean) => void;
}
export function SettingsView({
  theme,
  onThemeChange,
  onDirtyChange,
}: SettingsViewProps) {
  const { settings, providers, defaults, status, saving, save } = useSettings();
  const [activeId, setActiveId] = useState<string | null>(() =>
    window.matchMedia("(max-width: 767px)").matches ? null : "providers",
  );
  const [draft, setDraft] = useState<Settings | null>(settings);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newModeId, setNewModeId] = useState<string | null>(null);
  useEffect(() => {
    setDraft(settings);
    setDeleteId(null);
  }, [settings]);
  useEffect(() => {
    if (newModeId) document.getElementById(`name-${newModeId}`)?.focus();
  }, [newModeId]);
  const dirty = !!draft && !!settings && isDirty(draft, settings);
  const available = draft ? availableDictationModes(draft) : [];
  const invalid = !!draft && hasModeErrors(draft);
  const lastMode = available.length <= 1;
  const toDelete = available.find(mode => mode.id === deleteId);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  function update(next: Settings) {
    setDraft(next);
    setNotice("");
    setError("");
  }
  async function submit() {
    if (!draft || !dirty || hasModeErrors(draft)) return;
    setNotice("");
    setError("");
    try {
      await save(draft);
      setNotice("Einstellungen gespeichert.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Speichern fehlgeschlagen. Bitte erneut versuchen.",
      );
    }
  }
  function changeProvider(id: string, provider: Provider) {
    if (!draft) return;
    update(draft.customModes?.some(mode => mode.id === id)
      ? updateCustomMode(draft, id, { provider })
      : { ...draft, providers: { ...draft.providers, [id]: provider } });
  }
  function deleteButton(id: string, label: string) {
    return <Button variant="outline" size="sm" disabled={lastMode}
      aria-label={`${label || "Eigenen Modus"} löschen`}
      aria-describedby={lastMode ? "last-mode-hint" : undefined}
      onClick={() => setDeleteId(id)}>Löschen</Button>;
  }
  return <>
    {toDelete && draft ? <ConfirmDialog title={`${toDelete.label || "Eigenen Modus"} löschen?`}
      confirmLabel="Löschen" onClose={() => setDeleteId(null)}
      onConfirm={() => { update(deleteMode(draft, toDelete.id)); setDeleteId(null); }}>
      {toDelete.builtin
        ? "Der Standard-Modus wird ausgeblendet. Prompt und Anbieter bleiben erhalten und lassen sich wiederherstellen. Die Änderung wird mit den Einstellungen gespeichert."
        : "Dieser Modus wird entfernt. Bisherige Diktate bleiben im Verlauf lesbar. Die Änderung wird mit den Einstellungen gespeichert."}
    </ConfirmDialog> : null}
    <TwoLevel
      entries={entries}
      activeId={activeId}
      onSelect={setActiveId}
      onBack={() => setActiveId(null)}
      bandHead={
        <div className="stack settings-band-head">
          <Button
            block
            disabled={status !== "ready" || !dirty || saving || invalid}
            onClick={() => void submit()}
          >
            {saving ? "Wird gespeichert …" : "Einstellungen speichern"}
          </Button>
          <span className="field-hint">
            Einstellungen gelten auf allen Geräten; die Darstellung nur auf
            diesem.
          </span>
          <SettingsNotice />
          {invalid && <p role="alert" className="form-error">Bitte die markierten Felder unter „Modi &amp; Prompts“ korrigieren.</p>}
          {notice && (
            <p role="status" className="field-hint">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </div>
      }
    >
      {activeId === "appearance" ? (
        <Field
          label="Farbschema"
          hint="Folgt dem System, oder fest hell/dunkel. Gilt nur für dieses Gerät."
          htmlFor="theme"
        >
          <Select
            id="theme"
            value={theme}
            onChange={(event) =>
              onThemeChange(event.target.value as ThemePreference)
            }
          >
            <option value="system">System</option>
            <option value="light">Hell</option>
            <option value="dark">Dunkel</option>
          </Select>
        </Field>
      ) : draft && defaults ? (
        <fieldset
          className="form-fields stack"
          disabled={status !== "ready" || saving}
        >
          {activeId === "prompts" ? (
            <>
              <div className="stack">
                <div><Button variant="outline" disabled={(draft.customModes?.length ?? 0) >= 20}
                  aria-describedby="custom-mode-limit" onClick={() => {
                    const next = addCustomMode(draft);
                    update(next);
                    setNewModeId(next.customModes?.at(-1)?.id ?? null);
                  }}><Plus aria-hidden />Modus hinzufügen</Button></div>
                <p id="custom-mode-limit" className="field-hint">{draft.customModes?.length ?? 0} von 20 eigenen Modi</p>
                {lastMode && <p id="last-mode-hint" className="field-hint">Der letzte verfügbare Modus kann nicht gelöscht werden.</p>}
              </div>
              <p className="muted">
                Prompt je Modus. Der Anbieter wird unter „Anbieter“ gewählt.
              </p>
              {available.map((mode) => mode.builtin ? (
                <Card key={mode.id} className="mode-card">
                  <CardHeader
                    actions={
                      <div className="row wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          update({
                            ...draft,
                            prompts: {
                              ...draft.prompts,
                              [mode.id]: defaults.prompts[mode.builtin!],
                            },
                          })
                        }
                      >
                        Standard laden
                      </Button>
                      {deleteButton(mode.id, mode.label)}
                      </div>
                    }
                  >
                    <CardTitle>{mode.label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Field
                      label={`Anweisung für ${mode.label}`}
                      htmlFor={`prompt-${mode.id}`}
                    >
                      <Textarea
                        id={`prompt-${mode.id}`}
                        value={mode.prompt}
                        onChange={(event) =>
                          update({
                            ...draft,
                            prompts: {
                              ...draft.prompts,
                              [mode.id]: event.target.value,
                            },
                          })
                        }
                      />
                    </Field>
                  </CardContent>
                </Card>
              ) : <CustomModeCard key={mode.id} mode={mode} modes={draft.customModes ?? []}
                onChange={changes => update(updateCustomMode(draft, mode.id, changes))}
                deleteAction={deleteButton(mode.id, mode.label)} />)}
              {!!draft.hiddenModes?.length && <div><Button variant="outline" className="restore-modes"
                onClick={() => update(restoreBuiltinModes(draft))}>Gelöschte Standard-Modi wiederherstellen</Button></div>}
              {nonDictationModes.map(mode => <Card key={mode.id}>
                <CardHeader actions={<Button variant="outline" size="sm" onClick={() => update({
                  ...draft, prompts: { ...draft.prompts, [mode.id]: defaults.prompts[mode.id] },
                })}>Standard laden</Button>}><CardTitle>{mode.label}</CardTitle></CardHeader>
                <CardContent><Field label={`Anweisung für ${mode.label}`} htmlFor={`prompt-${mode.id}`}>
                  <Textarea id={`prompt-${mode.id}`} value={draft.prompts[mode.id]}
                    onChange={event => update({ ...draft, prompts: { ...draft.prompts, [mode.id]: event.target.value } })} />
                </Field></CardContent>
              </Card>)}
            </>
          ) : (
            <>
              <p className="muted">
                Anbieter für Transkription und Umschreiben, je Modus und für Meetings.
              </p>
              <Card>
                <CardHeader>
                  <CardTitle>Anbieter je Modus</CardTitle>
                  <CardDescription>
                    Die API-Schlüssel liegen auf dem Server, nicht im Browser.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Field label="Meetings" htmlFor="provider-meetings">
                    <Select id="provider-meetings" value={draft.providers.meetings ?? "mistral"}
                      onChange={event => update({ ...draft, providers: { ...draft.providers, meetings: event.target.value as "mistral" | "assemblyai" } })}>
                      <ProviderOptions available={providers?.meetings ?? []} invalid={providers?.invalid} selected={draft.providers.meetings ?? "mistral"} />
                    </Select>
                  </Field>
                  <SettingRow title="Bei Fehler auf AssemblyAI ausweichen" description="Audio geht dann an einen US-Anbieter."
                    control={<Switch label="Bei Fehler auf AssemblyAI ausweichen" checked={draft.meetingFallback ?? false}
                      onCheckedChange={checked => update({ ...draft, meetingFallback: checked })} />} />
                  {[...available, ...nonDictationModes.map(mode => ({ ...mode, provider: draft.providers[mode.id] }))].map((mode) => (
                    <Field
                      key={mode.id}
                      label={mode.label || "Neuer Modus"}
                      hint={mode.provider === "anthropic" && available.some(item => item.id === mode.id)
                        ? `Spracherkennung über ${dictationSttProvider(mode.provider, providers?.stt) === "mistral" ? "Mistral" : "OpenAI"}` : undefined}
                      htmlFor={`provider-${mode.id}`}
                    >
                      <Select
                        id={`provider-${mode.id}`}
                        value={mode.provider}
                        onChange={(event) =>
                          changeProvider(mode.id, event.target.value as Provider)
                        }
                      >
                        <ProviderOptions available={providers?.llm ?? []} invalid={providers?.invalid} selected={mode.provider} />
                      </Select>
                    </Field>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </fieldset>
      ) : (
        <SettingsNotice />
      )}
    </TwoLevel>
  </>;
}

function CustomModeCard({ mode, modes, onChange, deleteAction }: {
  mode: CustomMode;
  modes: CustomMode[];
  onChange: (changes: Partial<Omit<CustomMode, "id">>) => void;
  deleteAction: React.ReactNode;
}) {
  const errors = customModeErrors(mode, modes);
  return <Card className="mode-card">
    <CardHeader actions={deleteAction}><CardTitle>{mode.label || "Neuer Modus"}</CardTitle></CardHeader>
    <CardContent>
      <Field label="Name" htmlFor={`name-${mode.id}`}>
        <Input id={`name-${mode.id}`} value={mode.label} required aria-invalid={!!errors.label}
          aria-describedby={`name-hint-${mode.id}`} onChange={event => onChange({ label: event.target.value })} />
        <p id={`name-hint-${mode.id}`} className={errors.label ? "form-error" : "field-hint"}>
          {errors.label ?? `${mode.label.length}/40 Zeichen`}
        </p>
      </Field>
      <Field label="Beschreibung" htmlFor={`description-${mode.id}`}>
        <Input id={`description-${mode.id}`} value={mode.description ?? ""} aria-invalid={!!errors.description}
          aria-describedby={`description-hint-${mode.id}`} onChange={event => onChange({ description: event.target.value })} />
        <p id={`description-hint-${mode.id}`} className={errors.description ? "form-error" : "field-hint"}>
          {errors.description ?? `Optional · ${mode.description?.length ?? 0}/120 Zeichen · erscheint unter „Modi“`}
        </p>
      </Field>
      <Field label="Prompt" htmlFor={`prompt-${mode.id}`}>
        <Textarea id={`prompt-${mode.id}`} value={mode.prompt} required aria-invalid={!!errors.prompt}
          aria-describedby={`prompt-hint-${mode.id}`} onChange={event => onChange({ prompt: event.target.value })} />
        <p id={`prompt-hint-${mode.id}`} className={errors.prompt ? "form-error" : "field-hint"}>
          {errors.prompt ?? `${mode.prompt.length}/8000 Zeichen`}
        </p>
      </Field>
    </CardContent>
  </Card>;
}
