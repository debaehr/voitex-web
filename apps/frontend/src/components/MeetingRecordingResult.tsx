import type { MeetingResult } from "../lib/meeting-types";
import { MeetingSessions } from "./MeetingSessions";

export function MeetingRecordingResult({ meeting }: { meeting: MeetingResult }) {
  return <MeetingSessions source="recording" autoMeeting={meeting} />;
}
