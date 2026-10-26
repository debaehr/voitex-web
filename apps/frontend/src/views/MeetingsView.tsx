import { useState } from "react";
import { TwoLevel } from "../components/TwoLevel";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Select, Textarea } from "../components/ui";

const settingsEntries = [
  { id: "settings", title: "Einstellungen", subtitle: "Anbieter und Sprecher" },
  { id: "prompt", title: "Zusammenfassungs-Prompt", subtitle: "Vorlage und Chat-Modell" }
];

export function MeetingsView() {
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <TwoLevel
      entries={settingsEntries}
      activeId={activeId}
      onSelect={setActiveId}
      onBack={() => setActiveId(null)}
      bandHead={
        <div className="stack" style={{ gap: 8 }}>
          <Button variant="outline" block>
            Datei transkribieren …
          </Button>
          <span className="field-hint">0 Meetings · Aufnahme unter „Protokoll“</span>
        </div>
      }
      empty="Noch keine Meetings. Lade eine Audiodatei hoch oder nimm unter „Protokoll“ eine Sitzung auf."
    >
      {activeId === "prompt" ? (
        <Card>
          <CardHeader>
            <CardTitle>Zusammenfassungs-Prompt</CardTitle>
            <CardDescription>Das Transkript mit den eingetragenen Sprechernamen wird automatisch angehängt.</CardDescription>
          </CardHeader>
          <CardContent>
            <Field label="Prompt">
              <Textarea defaultValue="" placeholder="Erstelle eine strukturierte Meeting-Zusammenfassung …" />
            </Field>
            <Field label="Anbieter der Zusammenfassung">
              <Select defaultValue="openai">
                <option value="openai">OpenAI</option>
                <option value="mistral">Mistral</option>
                <option value="groq">Groq</option>
              </Select>
            </Field>
            <div className="row">
              <Button disabled>Speichern</Button>
              <Button variant="outline">Standardprompt laden</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Einstellungen</CardTitle>
            <CardDescription>Transkription mit Sprecherzuordnung über AssemblyAI.</CardDescription>
          </CardHeader>
          <CardContent>
            <Field label="Name der eigenen Stimme" hint="Erscheint im Transkript für dich, sobald du dich zuordnest.">
              <input className="input" defaultValue="Ich" style={{ maxWidth: 260 }} />
            </Field>
            <div>
              <Button disabled>Speichern</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </TwoLevel>
  );
}
