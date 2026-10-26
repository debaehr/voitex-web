import { useEffect, useState } from "react";
import { TwoLevel } from "../components/TwoLevel";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Select,
  Textarea,
} from "../components/ui";
import type { ThemePreference } from "../lib/theme";
import { SettingsNotice, useSettings } from "../lib/settings-context";
import { isDirty } from "../lib/settings";
import { settingModes, type Provider, type Settings } from "../lib/types";
const entries = [
  { id: "providers", title: "Anbieter" },
  { id: "prompts", title: "Modi & Prompts" },
  { id: "appearance", title: "Darstellung" },
];
const labels = {
  original: "Original",
  casual: "Casual",
  formal: "Formal",
  coding: "Coding",
  protocol: "Protokoll",
  summary: "Zusammenfassung",
};
const providerLabels: Record<string, string> = {
  openai: "OpenAI",
  mistral: "Mistral",
  groq: "Groq",
};
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
  useEffect(() => {
    setDraft(settings);
  }, [settings]);
  const dirty = !!draft && !!settings && isDirty(draft, settings);
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
    if (!draft || !dirty) return;
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
  const options = [
    ...new Set([
      "openai",
      "mistral",
      "groq",
      ...(providers?.llm ?? []),
      ...Object.values(draft?.providers ?? {}),
    ]),
  ];
  return (
    <TwoLevel
      entries={entries}
      activeId={activeId}
      onSelect={setActiveId}
      onBack={() => setActiveId(null)}
      bandHead={
        <div className="stack settings-band-head">
          <Button
            block
            disabled={status !== "ready" || !dirty || saving}
            onClick={() => void submit()}
          >
            {saving ? "Wird gespeichert …" : "Einstellungen speichern"}
          </Button>
          <span className="field-hint">
            Einstellungen gelten auf allen Geräten; die Darstellung nur auf
            diesem.
          </span>
          <SettingsNotice />
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
              <p className="muted">
                Prompt je Modus. Der Anbieter wird unter „Anbieter“ gewählt.
              </p>
              {settingModes.map((mode) => (
                <Card key={mode}>
                  <CardHeader
                    actions={
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          update({
                            ...draft,
                            prompts: {
                              ...draft.prompts,
                              [mode]: defaults.prompts[mode],
                            },
                          })
                        }
                      >
                        Standard laden
                      </Button>
                    }
                  >
                    <CardTitle>{labels[mode]}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Field
                      label={`Anweisung für ${labels[mode]}`}
                      htmlFor={`prompt-${mode}`}
                    >
                      <Textarea
                        id={`prompt-${mode}`}
                        value={draft.prompts[mode]}
                        onChange={(event) =>
                          update({
                            ...draft,
                            prompts: {
                              ...draft.prompts,
                              [mode]: event.target.value,
                            },
                          })
                        }
                      />
                    </Field>
                  </CardContent>
                </Card>
              ))}
            </>
          ) : (
            <>
              <p className="muted">
                Anbieter für Transkription und Umschreiben, je Modus. Meetings
                laufen immer über AssemblyAI.
              </p>
              <Card>
                <CardHeader>
                  <CardTitle>Anbieter je Modus</CardTitle>
                  <CardDescription>
                    Die API-Schlüssel liegen auf dem Server, nicht im Browser.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {settingModes.map((mode) => (
                    <Field
                      key={mode}
                      label={labels[mode]}
                      htmlFor={`provider-${mode}`}
                    >
                      <Select
                        id={`provider-${mode}`}
                        value={draft.providers[mode]}
                        onChange={(event) =>
                          update({
                            ...draft,
                            providers: {
                              ...draft.providers,
                              [mode]: event.target.value as Provider,
                            },
                          })
                        }
                      >
                        {options.map((provider) => (
                          <option
                            key={provider}
                            value={provider}
                            disabled={!providers?.llm.includes(provider)}
                          >
                            {providerLabels[provider] ?? provider}
                            {providers?.llm.includes(provider)
                              ? ""
                              : " (kein Schlüssel)"}
                          </option>
                        ))}
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
  );
}
