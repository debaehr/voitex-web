import { meetingClock, type MeetingDetailData, type MeetingStatus, type MeetingSummary } from "./meeting-types";
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
export function meetingTranscript(meeting: MeetingDetailData, names: Record<string, string>): string {
  const lines: string[] = [];
  for (const part of meeting.parts) {
    const gap = meeting.interruptions.find(item => item.afterPart === part.part - 1);
    if (gap) lines.push(gap.text);
    let previous: string | undefined;
    for (const segment of meeting.segments.filter(item => item.part === part.part)) {
      const name = names[segment.speakerId]?.trim() || segment.speakerLabel;
      if (previous === name) lines[lines.length - 1] += ` ${segment.text.trim()}`;
      else lines.push(`[${meetingClock(segment.start)}] ${name}: ${segment.text.trim()}`);
      previous = name;
    }
  }
  return lines.join("\n\n");
}
export const meetingsBySource = (meetings: MeetingSummary[], source: MeetingSummary["source"]) => meetings.filter(meeting => meeting.source === source);
