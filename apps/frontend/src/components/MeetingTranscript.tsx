import type { MeetingDetailData, MeetingSegment } from "../lib/meeting-types";
import { meetingClock } from "../lib/meeting-types";
import { meetingParagraphs, nextManualSpeakerId } from "../lib/meeting-presentation";
import { Select } from "./ui";

type Props = {
  meeting: MeetingDetailData; names: Record<string, string>; disabled: boolean;
  onAssign: (indices: number[], speakerId: string) => void;
};
export function MeetingTranscript({ meeting, names, disabled, onAssign }: Props) {
  const editable = meeting.status === "naming" || meeting.status === "done";
  // Build the options once; rescanning a long recording for every segment is quadratic.
  const speakersByPart = new Map<number, Map<string, MeetingSegment>>();
  for (const segment of meeting.segments) {
    let speakers = speakersByPart.get(segment.part);
    if (!speakers) { speakers = new Map(); speakersByPart.set(segment.part, speakers); }
    speakers.set(segment.speakerId, segment);
  }
  function speakerSelect(indices: number[], part: number, speakerId: string, label: string) {
    const speakers = [...(speakersByPart.get(part)?.values() ?? [])];
    return <Select aria-label={label} value={speakerId} disabled={disabled} onChange={event => {
      onAssign(indices, event.target.value === "new" ? nextManualSpeakerId(meeting, part) : event.target.value);
    }}>
      {speakers.map(speaker => <option key={speaker.speakerId} value={speaker.speakerId}>{names[speaker.speakerId]?.trim() || speaker.speakerLabel}</option>)}
      <option value="new">Neuer Sprecher</option>
    </Select>;
  }
  return <div className="meeting-transcript stack">{meetingParagraphs(meeting, names).map((paragraph, index) => paragraph.kind === "gap" ? <p key={`gap-${index}`}>{paragraph.text}</p> :
    <section className="stack transcript-paragraph" key={paragraph.indices[0]}>
      <p>[{meetingClock(paragraph.start)}] {paragraph.name}: {paragraph.text}</p>
      {editable && <>
        {speakerSelect(paragraph.indices, paragraph.part, paragraph.speakerId, `Sprecher für Absatz ${index + 1}`)}
        <details><summary>Satzweise zuordnen</summary><div className="stack transcript-segments">
          {paragraph.indices.map(segmentIndex => {
            const segment = meeting.segments[segmentIndex];
            return <div className="stack" key={segmentIndex}>
              <p>[{meetingClock(segment.start)}] {segment.text.trim()}</p>
              {speakerSelect([segmentIndex], segment.part, segment.speakerId, `Sprecher für Segment ${segmentIndex + 1}`)}
            </div>;
          })}
        </div></details>
      </>}
    </section>
  )}</div>;
}
