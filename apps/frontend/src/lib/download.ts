import type { MeetingSummary } from "./meeting-types";

export function meetingFileName(meeting: Pick<MeetingSummary, "title" | "createdAt">, kind: "protocol" | "transcript"): string {
  const parts = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(meeting.createdAt));
  const date = ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join(".");
  const clean = meeting.title.replace(/[\\/:*?"<>|\p{Cc}]/gu, "").replace(/\s+/g, " ");
  const title = Array.from(clean.replace(/^[ .]+|[ .]+$/g, "")).slice(0, 120).join("").replace(/[ .]+$/g, "");
  return `MoM_${date}${title ? `_${title}` : ""}${kind === "transcript" ? "_Transkript.txt" : ".md"}`;
}

export function downloadFile(
  filename: string,
  content: string,
  type: string,
): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Defer revocation so browsers have time to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
