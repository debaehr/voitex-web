import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui";

export interface ModeInfo {
  id: string;
  label: string;
  description: string;
}

interface ModesViewProps {
  modes: ModeInfo[];
  activeMode: string;
  disabled?: boolean;
  onModeChange: (id: string) => void;
}

export function ModesView({ modes, activeMode, onModeChange, disabled }: ModesViewProps) {
  return (
    <div className="page-column stack">
      <Card className="modes-list">
        <CardHeader>
          <span className="section-label">Modi</span>
        </CardHeader>
        <CardContent style={{ gap: 4 }}>
          {modes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              disabled={disabled}
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
