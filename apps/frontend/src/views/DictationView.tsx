import { Copy } from "lucide-react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui";

export interface ModeInfo {
  id: string;
  label: string;
  description: string;
}

interface DictationViewProps {
  modes: ModeInfo[];
  activeMode: string;
  onModeChange: (id: string) => void;
  lastResult: { text: string; meta: string } | null;
  onCopy: (text: string) => void;
}

export function DictationView({ modes, activeMode, onModeChange, lastResult, onCopy }: DictationViewProps) {
  return (
    <div className="page-column stack">
      <Card className="card-pad">
        <p className="muted">
          Punkt unten antippen, sprechen, Stopp drücken. Der Text landet in der Zwischenablage und im Verlauf.
        </p>
      </Card>

      <Card>
        <CardHeader
          actions={
            lastResult ? (
              <Button variant="outline" size="sm" onClick={() => onCopy(lastResult.text)}>
                <Copy /> Kopieren
              </Button>
            ) : undefined
          }
        >
          <span className="section-label">Letztes Ergebnis</span>
          {lastResult ? <span className="field-hint">{lastResult.meta}</span> : null}
        </CardHeader>
        <CardContent>
          {lastResult ? (
            <p style={{ whiteSpace: "pre-wrap", fontSize: 15 }}>{lastResult.text}</p>
          ) : (
            <p className="muted">Noch kein Diktat in dieser Sitzung.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <span className="section-label">Modi</span>
        </CardHeader>
        <CardContent style={{ gap: 4 }}>
          {modes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className="list-row"
              aria-pressed={mode.id === activeMode}
              onClick={() => onModeChange(mode.id)}
              style={{
                minHeight: 52,
                margin: "0 -8px",
                padding: "8px",
                border: 0,
                borderRadius: "var(--radius-md)",
                background: mode.id === activeMode ? "var(--accent)" : "transparent",
                textAlign: "left",
                cursor: "pointer"
              }}
            >
              <div className="grow stack" style={{ gap: 2 }}>
                <CardTitle style={{ fontWeight: 500, fontSize: 15 }}>{mode.label}</CardTitle>
                <CardDescription className="text-xs">{mode.description}</CardDescription>
              </div>
              {mode.id === activeMode ? <span className="badge badge-secondary">aktiv</span> : null}
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
