import { Copy } from "lucide-react";
import { Button, Card, CardContent, CardHeader } from "../components/ui";

interface DictationViewProps {
  lastResult: { text: string; meta: string } | null;
  onCopy: (text: string) => void;
}

export function DictationView({ lastResult, onCopy }: DictationViewProps) {
  return (
    <div className="page-column stack">
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
    </div>
  );
}
