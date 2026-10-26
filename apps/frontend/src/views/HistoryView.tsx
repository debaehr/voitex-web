import { ArrowUpDown, Copy } from "lucide-react";
import { useState } from "react";
import { TwoLevel } from "../components/TwoLevel";
import { Button, Card, CardContent, Field, Input } from "../components/ui";

export interface HistoryRow {
  id: string;
  createdAt: string;
  mode: string;
  transcript: string;
}

interface HistoryViewProps {
  entries: HistoryRow[];
  onCopy: (text: string) => void;
}

export function HistoryView({ entries, onCopy }: HistoryViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newestFirst, setNewestFirst] = useState(true);
  const ordered = newestFirst ? [...entries].reverse() : entries;
  const active = entries.find((entry) => entry.id === activeId) ?? null;

  return (
    <TwoLevel
      entries={ordered.map((entry) => ({
        id: entry.id,
        title: entry.mode,
        badge: <span className="mono text-xs muted">{formatShort(entry.createdAt)}</span>,
        subtitle: entry.transcript,
        onDelete: () => undefined
      }))}
      activeId={active ? active.id : null}
      onSelect={setActiveId}
      onBack={() => setActiveId(null)}
      bandHead={
        <div className="stack" style={{ gap: 6 }}>
          <div className="row between">
            <span className="field-hint">{entries.length} Einträge</span>
            <div className="row" style={{ gap: 4 }}>
              <Button variant="ghost" size="sm" disabled={entries.length === 0}>
                Exportieren
              </Button>
              <Button variant="ghost" size="sm" disabled={entries.length === 0} style={{ color: "var(--destructive)" }}>
                Alles löschen
              </Button>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setNewestFirst((value) => !value)} style={{ justifyContent: "flex-start" }}>
            <ArrowUpDown /> {newestFirst ? "Neueste zuerst" : "Älteste zuerst"}
          </Button>
        </div>
      }
      empty={entries.length === 0 ? "Noch keine Diktate im Verlauf." : "Links einen Eintrag wählen."}
    >
      {active ? (
        <Card>
          <CardContent style={{ paddingTop: 20 }}>
            <div className="row between">
              <span className="row" style={{ gap: 6 }}>
                <span className="muted">{active.mode}</span>
              </span>
              <span className="muted text-xs">{new Date(active.createdAt).toLocaleString("de-DE")}</span>
            </div>
            <div className="stack" style={{ gap: 4 }}>
              <span className="section-label" style={{ fontSize: 12 }}>
                Endtext
              </span>
              <p style={{ whiteSpace: "pre-wrap", fontSize: 15 }}>{active.transcript}</p>
            </div>
            <div className="row">
              <Button variant="outline" onClick={() => onCopy(active.transcript)}>
                <Copy /> Kopieren
              </Button>
            </div>
            <hr className="divider" />
            <Field label="Begriff ins Lexikon" hint="Korrekte Schreibweise eines falsch erkannten Begriffs — gilt für künftige Aufnahmen.">
              <div className="row">
                <Input placeholder="z. B. Produktname, Eigenname, Fachbegriff" />
                <Button variant="secondary">Hinzufügen</Button>
              </div>
            </Field>
            <div>
              <Button variant="destructive">Diesen Eintrag löschen</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </TwoLevel>
  );
}

function formatShort(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}, ${date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
}
