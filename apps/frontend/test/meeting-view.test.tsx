import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ProtocolView } from "../src/views/ProtocolView";
import { OverlayBar } from "../src/components/OverlayBar";
import { initialMeetingSnapshot, type MeetingRecorder } from "../src/lib/meeting-recorder";
const controller = {} as MeetingRecorder;
it("enables the live start flow with setup hints and adds the iPhone/iPad warning only on iOS", () => {
  for (const isIOS of [true, false]) {
    const html = renderToStaticMarkup(<ProtocolView state={{ ...initialMeetingSnapshot, phase: "idle", isIOS }} controller={controller} language="hr" dictationActive={false} />);
    expect(html).toContain("Aufnahmesprache: HR"); expect(html).toContain("Titel (optional)");
    expect(html.includes("Homescreen oder Sperren")).toBe(isIOS);
    expect(html).toMatch(/<button[^>]*aria-describedby="meeting-start-hint"/);
    expect(html).not.toMatch(/<button[^>]*disabled/);
  }
});
it("presents recovery choices, offline upload progress and the interrupted state", () => {
  const html = renderToStaticMarkup(<ProtocolView state={{ ...initialMeetingSnapshot, phase: "recovery", canResume: true, offline: true, pending: 2, total: 3, secured: 5 }} controller={controller} language="de" dictationActive={false} />);
  for (const label of ["Nicht abgeschlossene Aufnahme", "Fortsetzen", "Jetzt verarbeiten", "Verwerfen", "gesichert bis 00:00:05", "Offline"]) expect(html).toContain(label);
  const interrupted = renderToStaticMarkup(<ProtocolView state={{ ...initialMeetingSnapshot, phase: "interrupted", hint: "Mikrofon unterbrochen" }} controller={controller} language="de" dictationActive={false} />);
  expect(interrupted).toContain("Unterbrochen"); expect(interrupted).toContain("Mikrofon unterbrochen");
});
it("renders protocols as escaped plain text and exposes retry for provider errors", () => {
  const result = { id: "id", title: "Review", language: "de", status: "done" as const, progress: 100, protocol: "<script>never()</script>\n# Meeting" };
  const html = renderToStaticMarkup(<ProtocolView state={{ ...initialMeetingSnapshot, phase: "done", result }} controller={controller} language="de" dictationActive={false} />);
  expect(html).toContain('<div class="meeting-protocol"><p>&lt;script&gt;'); expect(html).not.toContain("<script>"); expect(html).toContain("Fertig");
  const error = renderToStaticMarkup(<ProtocolView state={{ ...initialMeetingSnapshot, phase: "error", result: { ...result, status: "error" }, error: "Fehler" }} controller={controller} language="de" dictationActive={false} />);
  expect(error).toContain("Erneut versuchen"); expect(error).toContain('role="alert"');
});
it("disables the overlay recording button with a linked explanation during a meeting", () => {
  const html = renderToStaticMarkup(<OverlayBar languages={[{ id: "de", label: "Deutsch", short: "DE" }]} language="de" onLanguageChange={() => {}}
    targetLanguage="source" onTargetLanguageChange={() => {}} modes={[]} mode="formal" onModeChange={() => {}} recording={false} elapsedSeconds={0} levels={[]} busyText={null} message={null}
    recordingDisabled lockText="Meeting-Aufnahme aktiv — Diktat gesperrt." onStart={() => {}} onStop={() => {}} />);
  expect(html).toMatch(/aria-label="Diktat starten" disabled="" aria-describedby="dictation-lock"/);
  expect(html).toContain('id="dictation-lock"'); expect(html).toContain("Diktat gesperrt");
});

it("shows the system audio switch only when supported", () => {
  for (const systemAudioSupported of [true, false]) {
    const html = renderToStaticMarkup(<ProtocolView state={{ ...initialMeetingSnapshot, phase: "idle", systemAudioSupported }} controller={controller} language="de" dictationActive={false} />);
    expect(html.includes("Ton des Computers mit aufnehmen (Teams, Zoom …)")).toBe(systemAudioSupported);
    expect(html).not.toContain('checked=""');
  }
});
it("shows explicit display permission choices, two meters and the ended banner", () => {
  const choices = renderToStaticMarkup(<ProtocolView state={{ ...initialMeetingSnapshot, phase: "interrupted", systemAudioChoice: "Kein Ton freigegeben" }} controller={controller} language="de" dictationActive={false} />);
  expect(choices).toContain("Erneut versuchen"); expect(choices).toContain("Nur Mikrofon");
  const html = renderToStaticMarkup(<ProtocolView state={{ ...initialMeetingSnapshot, phase: "recording", systemAudio: true, systemAudioEnded: true }} controller={controller} language="de" dictationActive={false} />);
  expect(html).toContain('aria-label="Mikrofonpegel"'); expect(html).toContain('aria-label="Computerpegel"');
  expect(html).toContain("Computerton wird nicht mehr aufgenommen"); expect(html).toContain("Erneut freigeben"); expect(html).toContain("Aufnahme läuft");
});
