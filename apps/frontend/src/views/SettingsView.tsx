import { ProviderModelsCard } from "../components/ProviderModelsCard";
import { useEffect, useState } from "react";
import { TwoLevel } from "../components/TwoLevel";
import { ConfirmDialog } from "../components/Dialog";
import { Plus } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
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
import { addCustomMode, availableDictationModes, customModeErrors, deleteMode, hasModeErrors, restoreBuiltinModes, updateCustomMode } from "../lib/modes";
import type { CustomMode, Settings } from "../lib/types";
const entries = [
  { id: "providers", title: "Anbieter und Modelle" },
  { id: "prompts", title: "Modi & Prompts" },
  { id: "dictation", title: "Diktat" },
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
          {activeId === "dictation" ? (
            <SettingRow title="Leertaste pausiert und setzt Aufnahmen fort (Diktat und Meetings)"
              description="Gilt, wenn der Fokus auf der Diktatleiste oder in der Meeting-Aufnahmekarte liegt."
              control={<Switch label="Leertaste pausiert und setzt Aufnahmen fort (Diktat und Meetings)" checked={draft.dictationSpacePause ?? false}
                onCheckedChange={checked => update({ ...draft, dictationSpacePause: checked })} />} />
          ) : activeId === "prompts" ? (
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
                Prompt je Modus. Der Anbieter wird unter „Anbieter und Modelle“ gewählt.
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
            <ProviderModelsCard settings={draft} providers={providers ?? undefined} onChange={update} />
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
