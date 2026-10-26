import { useState } from "react";
import { TwoLevel } from "../components/TwoLevel";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Select, Textarea } from "../components/ui";
import type { ThemePreference } from "../lib/theme";

const entries = [
  { id: "providers", title: "Anbieter" },
  { id: "prompts", title: "Modi & Prompts" },
  { id: "appearance", title: "Darstellung" }
];

interface SettingsViewProps {
  theme: ThemePreference;
  onThemeChange: (value: ThemePreference) => void;
}

export function SettingsView({ theme, onThemeChange }: SettingsViewProps) {
  // Desktop opens on the first band entry like voitex; phones start with the list.
  const [activeId, setActiveId] = useState<string | null>(() =>
    window.matchMedia("(max-width: 767px)").matches ? null : "providers"
  );

  return (
    <TwoLevel
      entries={entries}
      activeId={activeId}
      onSelect={setActiveId}
      onBack={() => setActiveId(null)}
      bandHead={
        <div className="stack" style={{ gap: 6 }}>
          <Button block disabled>
            Einstellungen speichern
          </Button>
          <span className="field-hint">Einstellungen gelten auf allen Geräten; die Darstellung nur auf diesem.</span>
        </div>
      }
    >
      {activeId === "appearance" ? (
        <div className="stack">
          <Field label="Farbschema" hint="Folgt dem System, oder fest hell/dunkel. Gilt nur für dieses Gerät." htmlFor="theme">
            <Select id="theme" value={theme} onChange={(event) => onThemeChange(event.target.value as ThemePreference)}>
              <option value="system">System</option>
              <option value="light">Hell</option>
              <option value="dark">Dunkel</option>
            </Select>
          </Field>
        </div>
      ) : activeId === "prompts" ? (
        <div className="stack">
          <p className="muted">Prompt je Modus. Der Anbieter wird unter „Anbieter“ gewählt.</p>
          {["Original", "Casual", "Formal", "Coding"].map((mode) => (
            <Card key={mode}>
              <CardHeader>
                <CardTitle>{mode}</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea defaultValue="" placeholder={`Anweisung für ${mode} …`} style={{ minHeight: 100 }} />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="stack">
          <p className="muted">Anbieter für Transkription und Umschreiben, je Modus. Meetings laufen immer über AssemblyAI.</p>
          <Card>
            <CardHeader>
              <CardTitle>Anbieter je Modus</CardTitle>
              <CardDescription>Die API-Schlüssel liegen auf dem Server, nicht im Browser.</CardDescription>
            </CardHeader>
            <CardContent>
              {["Original", "Casual", "Formal", "Coding", "Protokoll"].map((mode) => (
                <Field key={mode} label={mode}>
                  <Select defaultValue="openai">
                    <option value="openai">OpenAI</option>
                    <option value="mistral">Mistral</option>
                    <option value="groq">Groq</option>
                  </Select>
                </Field>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </TwoLevel>
  );
}
