import type { MeetingResult } from "../lib/meeting-types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui";

// Run 3 can replace this boundary with the full transcript/protocol result view.
export function MeetingRecordingResult({ meeting }: { meeting: MeetingResult }) {
  return <Card>
    <CardHeader><CardTitle>Fertig{meeting.title ? ` · ${meeting.title}` : ""}</CardTitle></CardHeader>
    <CardContent><pre className="meeting-protocol">{meeting.protocol}</pre></CardContent>
  </Card>;
}
