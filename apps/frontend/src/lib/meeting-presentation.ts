import { meetingClock, type MeetingDetailData, type MeetingSegment, type MeetingStatus, type MeetingSummary } from "./meeting-types";
export const meetingLabels: Record<MeetingStatus, string> = {
  queued: "Wartet auf Verarbeitung", transcribing: "Wird transkribiert", naming: "Namen zuordnen",
  summarizing: "Protokoll wird erstellt", done: "Fertig", error: "Verarbeitung fehlgeschlagen",
};
export const isMeetingProcessing = (status: MeetingStatus) => ["queued", "transcribing", "summarizing"].includes(status);
export const meetingDate = (value: string) => new Date(value).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
export const meetingMeta = (meeting: MeetingSummary) => `${meetingDate(meeting.createdAt)} · ${meeting.durationSeconds === undefined ? "Dauer unbekannt" : meetingClock(meeting.durationSeconds)}`;
export const audioAvailable = (meeting: Pick<MeetingSummary, "audioDeletedAt" | "audioExpiresAt">, now = Date.now()) =>
  !meeting.audioDeletedAt && (!meeting.audioExpiresAt || Date.parse(meeting.audioExpiresAt) > now);
export const audioUrl = (id: string, part: number) => `/api/meetings/${encodeURIComponent(id)}/audio?part=${part}`;
export function parseParticipants(value: string): string[] {
  const names = value.split(",").map(name => name.trim()).filter(Boolean);
  if (names.length > 20 || names.some(name => name.length > 60)) throw new Error("Bitte höchstens 20 Namen mit jeweils maximal 60 Zeichen eingeben.");
  return [...new Set(names)];
}
export const nonEmptyNames = (names: Record<string, string>) => Object.fromEntries(Object.entries(names).map(([id, name]) => [id, name.trim()]).filter(([, name]) => name));
export type TranscriptParagraph = { kind: "gap"; text: string } | {
  kind: "speech"; part: number; speakerId: string; name: string; start: number; text: string; indices: number[];
};
export function meetingParagraphs(meeting: MeetingDetailData, names: Record<string, string>): TranscriptParagraph[] {
  const paragraphs: TranscriptParagraph[] = [];
  for (const part of meeting.parts) {
    const gap = meeting.interruptions.find(item => item.afterPart === part.part - 1);
    if (gap) paragraphs.push({ kind: "gap", text: gap.text });
    let previous: Extract<TranscriptParagraph, { kind: "speech" }> | undefined;
    meeting.segments.forEach((segment, index) => {
      if (segment.part !== part.part) return;
      const name = names[segment.speakerId]?.trim() || segment.speakerLabel;
      if (previous?.name === name) {
        previous.text += ` ${segment.text.trim()}`; previous.indices.push(index);
      } else {
        previous = { kind: "speech", part: part.part, speakerId: segment.speakerId, name, start: segment.start, text: segment.text.trim(), indices: [index] };
        paragraphs.push(previous);
      }
    });
  }
  return paragraphs;
}
export function meetingTranscript(meeting: MeetingDetailData, names: Record<string, string>): string {
  return meetingParagraphs(meeting, names).map(paragraph => paragraph.kind === "gap" ? paragraph.text :
    `[${meetingClock(paragraph.start)}] ${paragraph.name}: ${paragraph.text}`).join("\n\n");
}
export function nextManualSpeakerId(meeting: MeetingDetailData, part: number): string {
  // Retired keys may still have names; reusing them would give a new speaker an old name.
  const used = new Set([...meeting.segments.map(segment => segment.speakerId), ...Object.keys(meeting.speakerNames)]);
  let number = 1;
  while (used.has(`${part}:manual-${number}`)) number++;
  return `${part}:manual-${number}`;
}
export function speakerQuotes(meeting: MeetingDetailData, speakerId: string): MeetingSegment[] {
  const segments = meeting.segments.filter(segment => segment.speakerId === speakerId && segment.text.trim()).sort((a, b) => a.start - b.start);
  if (segments.length <= 5) return segments;
  const selected = new Set<MeetingSegment>();
  const first = segments[0].start, last = segments[segments.length - 1].start;
  // Sample time rather than segment count so a busy opening cannot hide a later speaker change.
  for (let index = 0; index < 5; index++) {
    const target = first + (last - first) * index / 4;
    const remaining = segments.filter(segment => !selected.has(segment));
    selected.add(remaining.reduce((closest, segment) => Math.abs(segment.start - target) < Math.abs(closest.start - target) ? segment : closest));
  }
  return [...selected].sort((a, b) => a.start - b.start);
}
export const meetingsBySource = (meetings: MeetingSummary[], source: MeetingSummary["source"]) => meetings.filter(meeting => meeting.source === source);
