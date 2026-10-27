import { Circle, Info } from "lucide-react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui";

// Long session recording (F-006). Layout only in step 1; the chunked,
// crash-safe recorder and the AssemblyAI job flow follow in a later step.
export function ProtocolView() {
  return (
    <div className="page-column stack">
      <Card>
        <CardHeader>
          <CardTitle>Sitzung aufnehmen</CardTitle>
          <CardDescription>
            Nimmt eine Besprechung über das Mikrofon auf, bis zu drei Stunden. Danach folgen Transkript mit
            Sprecherzuordnung und Protokoll.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
            <Info size={16} className="muted" style={{ marginTop: 2, flexShrink: 0 }} />
            <p className="field-hint">Bitte alle Teilnehmenden vorher über die Aufnahme informieren.</p>
          </div>
          <div className="stack">
            <Button disabled aria-describedby="long-recording-hint">
              <Circle fill="currentColor" /> Aufnahme starten
            </Button>
            <p id="long-recording-hint" className="field-hint">Langzeitaufnahme folgt in Etappe 3.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <span className="section-label">Letzte Sitzungen</span>
        </CardHeader>
        <CardContent>
          <p className="muted">Noch keine Sitzung aufgenommen.</p>
        </CardContent>
      </Card>
    </div>
  );
}
