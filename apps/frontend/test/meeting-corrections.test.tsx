import { afterEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MeetingTranscript } from "../src/components/MeetingTranscript";
import { MeetingDetail } from "../src/components/MeetingDetail";
import { api } from "../src/lib/api";
import { meetingFileName } from "../src/lib/download";
import { meetingParagraphs, speakerQuotes, nextManualSpeakerId } from "../src/lib/meeting-presentation";
import { protocolLanguages, readProtocolLanguage, saveProtocolLanguage } from "../src/lib/protocol-language";
import type { MeetingDetailData } from "../src/lib/meeting-types";
const meeting: MeetingDetailData = {
  id: "review", source: "recording", title: "Review", language: "de", createdAt: "2026-10-29T08:00:00Z", status: "naming", progress: 100,
  protocol: "Protokoll", transcript: "", speakerNames: { "1:A": "Anna" }, parts: [{ part: 1, contentType: "audio/webm" }, { part: 2, contentType: "audio/webm" }],
  segments: [
    { speakerId: "1:A", speakerLabel: "Sprecher 1", part: 1, start: 0, end: 1, text: "Erster Satz." },
    { speakerId: "1:A", speakerLabel: "Sprecher 1", part: 1, start: 1, end: 2, text: "Zweiter Satz." },
    { speakerId: "1:B", speakerLabel: "Sprecher 2", part: 1, start: 2, end: 3, text: "Antwort." },
    { speakerId: "2:A", speakerLabel: "Teil 2 · Sprecher 1", part: 2, start: 0, end: 1, text: "Fortsetzung." }
  ], interruptions: [], audioExpiresAt: "2099-01-01T00:00:00Z"
};
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
// Exercise the real stateless controls and their event handlers without adding a DOM dependency.
function elements(node: ReactNode): ReactElement<any>[] {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement<any>(child)) return [];
    if (typeof child.type === "function") return elements((child.type as (props: any) => ReactNode)(child.props));
    return [child, ...elements(child.props.children)];
  });
}
function controls(onAssign = vi.fn(), value = meeting) {
  const tree = MeetingTranscript({ meeting: value, names: value.speakerNames, disabled: false, onAssign });
  return { nodes: elements(tree), onAssign };
}
describe("transcript speaker controls", () => {
  it("assigns all paragraph segments together and offers only speakers from its part", () => {
    const { nodes, onAssign } = controls();
    const select = nodes.find(node => node.type === "select" && node.props["aria-label"] === "Sprecher für Absatz 1")!;
    expect(elements(select.props.children).map(node => node.props.value)).toEqual(["1:A", "1:B", "new"]);
    select.props.onChange({ target: { value: "1:B" } });
    expect(onAssign).toHaveBeenCalledWith([0, 1], "1:B");
  });
  it("expands to individual segment controls and can create a new speaker for one sentence", () => {
    const { nodes, onAssign } = controls();
    expect(nodes.some(node => node.type === "summary" && node.props.children === "Satzweise zuordnen")).toBe(true);
    const select = nodes.find(node => node.type === "select" && node.props["aria-label"] === "Sprecher für Segment 2")!;
    select.props.onChange({ target: { value: "new" } });
    expect(onAssign).toHaveBeenCalledWith([1], "1:manual-1");
    select.props.onChange({ target: { value: "1:B" } });
    expect(onAssign).toHaveBeenLastCalledWith([1], "1:B");
  });
  it("shows a newly assigned speaker in naming immediately and hides speakers without segments", () => {
    const updated = { ...meeting, segments: meeting.segments.map((segment, index) => index < 2 ? { ...segment, speakerId: "1:manual-1", speakerLabel: "Sprecher 3" } : segment) };
    const html = renderToStaticMarkup(<MeetingDetail id={meeting.id} initial={updated} />);
    expect(html).toContain('id="speaker-1:manual-1"'); expect(html).not.toContain('id="speaker-1:A"');
    expect(html).toContain("Stecken zwei Personen in einem Sprecher? Im Transkript Absätze einem neuen Sprecher zuweisen.");
  });
  it("keeps part boundaries and interruption markers when names merge paragraphs", () => {
    const updated = { ...meeting, speakerNames: { "1:A": "Anna", "1:B": "Anna", "2:A": "Anna" }, interruptions: [{ afterPart: 1, start: "", end: "", text: "Pause" }] };
    const paragraphs = meetingParagraphs(updated, updated.speakerNames);
    expect(paragraphs.map(item => item.kind)).toEqual(["speech", "gap", "speech"]);
    expect(paragraphs[0]).toMatchObject({ indices: [0, 1, 2], text: "Erster Satz. Zweiter Satz. Antwort." });
  });
  it("does not reuse manual keys whose saved names remain after a reset", () => {
    expect(nextManualSpeakerId({ ...meeting, speakerNames: { "1:manual-1": "Carla" } }, 1)).toBe("1:manual-2");
    expect(nextManualSpeakerId(meeting, 2)).toBe("2:manual-1");
  });
  it.each(["queued", "transcribing", "summarizing", "error"] as const)("hides correction actions during %s", status => {
    const html = renderToStaticMarkup(<MeetingDetail id={meeting.id} initial={{ ...meeting, status }} />);
    expect(html).not.toContain("Satzweise zuordnen"); expect(html).not.toContain("Zuordnung zurücksetzen");
  });
  it("sends segment and reset corrections using PATCH", async () => {
    const fetch = vi.fn(async () => new Response("{}")); vi.stubGlobal("fetch", fetch);
    await api.patchMeeting("review", { segmentSpeakers: { "0": "1:B", "1": "1:B" } });
    await api.patchMeeting("review", { resetSpeakers: true });
    const calls = fetch.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls.map(([, init]) => init.method)).toEqual(["PATCH", "PATCH"]);
    expect(JSON.parse(calls[0][1].body as string)).toEqual({ segmentSpeakers: { "0": "1:B", "1": "1:B" } });
    expect(JSON.parse(calls[1][1].body as string)).toEqual({ resetSpeakers: true });
  });
});
describe("speaker quotes", () => {
  it("selects at most five quotes across the entire recording and keeps a play button per quote", () => {
    const segments = Array.from({ length: 101 }, (_, index) => ({ ...meeting.segments[0], start: index * 10, end: index * 10 + 1, text: `Zitat ${index}` }));
    const value = { ...meeting, segments };
    expect(speakerQuotes(value, "1:A").map(segment => segment.start)).toEqual([0, 250, 500, 750, 1000]);
    const html = renderToStaticMarkup(<MeetingDetail id={meeting.id} initial={value} />);
    expect((html.match(/<blockquote/g) ?? []).length).toBe(5);
    expect((html.match(/aria-label="[^"]*anhören/g) ?? []).length).toBe(5);
    expect(speakerQuotes(meeting, "1:A")).toHaveLength(2);
  });
  it("spreads quotes in time even when most segments occur at the beginning", () => {
    const starts = [...Array.from({ length: 30 }, (_, index) => index), 250, 500, 750, 1000];
    expect(speakerQuotes({ ...meeting, segments: starts.map(start => ({ ...meeting.segments[0], start })) }, "1:A").map(segment => segment.start)).toEqual([0, 250, 500, 750, 1000]);
  });
});
describe("protocol language", () => {
  it("offers the meeting default and configured languages without automatic detection", () => {
    expect(protocolLanguages.map(item => item.id)).toEqual(["", "de", "en", "hr"]);
    const html = renderToStaticMarkup(<MeetingDetail id={meeting.id} initial={meeting} />);
    expect(html).toContain("Protokollsprache"); expect(html).toContain("Wie im Meeting");
  });
  it("remembers a per-device selection, sends it with and without names, and can restore the meeting language", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) });
    expect(readProtocolLanguage()).toBe(""); saveProtocolLanguage("en"); expect(readProtocolLanguage()).toBe("en");
    const fetch = vi.fn(async () => new Response("{}")); vi.stubGlobal("fetch", fetch);
    await api.protocolMeeting("review", { "1:A": "Anna" }, readProtocolLanguage());
    await api.protocolMeeting("review", undefined, "hr");
    saveProtocolLanguage(""); await api.protocolMeeting("review", undefined, readProtocolLanguage());
    const calls = fetch.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(JSON.parse(calls[0][1].body as string)).toEqual({ speakerNames: { "1:A": "Anna" }, protocolLanguage: "en" });
    expect(JSON.parse(calls[1][1].body as string)).toEqual({ protocolLanguage: "hr" });
    expect(calls[2][1].body).toBeUndefined(); expect(readProtocolLanguage()).toBe("");
  });
  it("tolerates inaccessible storage and ignores obsolete values", () => {
    vi.stubGlobal("localStorage", { getItem: () => "auto", setItem: () => { throw Error("denied"); } });
    expect(readProtocolLanguage()).toBe(""); expect(() => saveProtocolLanguage("en")).not.toThrow();
    vi.stubGlobal("localStorage", { getItem: () => { throw Error("denied"); } }); expect(readProtocolLanguage()).toBe("");
  });
  it("shows the generated protocol language beside its provider", () => {
    const html = renderToStaticMarkup(<MeetingDetail id={meeting.id} initial={{ ...meeting, status: "done", protocolProvider: "Mistral", protocolLanguage: "en" }} />);
    expect(html).toContain("Mistral · Protokollsprache: Englisch");
  });
});
describe("meeting download filenames", () => {
  it.each(["recording", "upload"] as const)("sanitizes only forbidden title characters for %s", source => {
    const value = { ...meeting, source, title: ' . BAU / 2027: \\ Test*?"<>|\u0000\u007f\u0085 – Željko. ' };
    expect(meetingFileName(value, "protocol")).toBe("MoM_2026.10.29_BAU 2027 Test – Željko.md");
    expect(meetingFileName(value, "transcript")).toBe("MoM_2026.10.29_BAU 2027 Test – Željko_Transkript.txt");
  });
  it.each(["", " . ", "/*?:"])("omits an empty sanitized title (%j)", title => {
    expect(meetingFileName({ ...meeting, title }, "protocol")).toBe("MoM_2026.10.29.md");
    expect(meetingFileName({ ...meeting, title }, "transcript")).toBe("MoM_2026.10.29_Transkript.txt");
  });
  it.each([
    ["2026-10-28T23:30:00Z", "2026.10.29"], ["2026-06-28T22:30:00Z", "2026.06.29"], ["2026-10-29T00:30:00+03:00", "2026.10.28"]
  ])("uses the Berlin calendar date at the day boundary (%s)", (createdAt, date) => {
    expect(meetingFileName({ ...meeting, title: "", createdAt }, "protocol")).toBe(`MoM_${date}.md`);
  });
  it("caps the title at 120 characters without splitting Unicode or leaving trailing dots", () => {
    expect(meetingFileName({ ...meeting, title: "😀".repeat(121) }, "protocol")).toBe(`MoM_2026.10.29_${"😀".repeat(120)}.md`);
    expect(meetingFileName({ ...meeting, title: "a".repeat(119) + ". more" }, "protocol")).toBe(`MoM_2026.10.29_${"a".repeat(119)}.md`);
  });
});
