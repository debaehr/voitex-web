import { renderToStaticMarkup } from "react-dom/server";
import { SlidersHorizontal } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { languages } from "../src/App";
import { navAll, navTop, tabSections } from "../src/lib/nav";
import { DictationView } from "../src/views/DictationView";
import { MeetingsView } from "../src/views/MeetingsView";
import { ModesView } from "../src/views/ModesView";
import { ProtocolView } from "../src/views/ProtocolView";
import { initialMeetingSnapshot } from "../src/lib/meeting-recorder";

vi.mock("../src/lib/settings-context", () => ({
  useSettings: () => ({ settings: null, status: "loading", saving: false, save: vi.fn() }),
  SettingsNotice: () => null,
}));

describe("navigation follow-up", () => {
  it("renames recording and upload labels and titles while retaining section ids", () => {
    expect(navAll.find(entry => entry.id === "protocol")).toMatchObject({ label: "Meetings", title: "Meetings" });
    expect(navAll.find(entry => entry.id === "meetings")).toMatchObject({ label: "Transkript", title: "Transkript" });
  });

  it("places modes after snippets in the sidebar and in the phone More sheet", () => {
    const snippetsIndex = navTop.findIndex(entry => entry.id === "snippets");
    expect(navTop[snippetsIndex + 1]).toMatchObject({ id: "modes", label: "Modi", title: "Modi", icon: SlidersHorizontal });
    expect(tabSections).toEqual(["dictation", "protocol", "meetings", "history"]);
    expect(navAll.filter(entry => !tabSections.includes(entry.id)).map(entry => entry.id)).toContain("modes");
  });

  it("offers Croatian after Auto, German and English", () => {
    expect(languages.map(language => language.id)).toEqual(["auto", "de", "en", "hr"]);
    expect(languages[3]).toEqual({ id: "hr", label: "Kroatisch (hr)", short: "HR" });
  });

  it("explains recording setup and disables meeting starts during dictation", () => {
    const html = renderToStaticMarkup(<ProtocolView state={{ ...initialMeetingSnapshot, phase: "idle" }} controller={null} language="de" dictationActive />);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby="meeting-start-hint"/);
    expect(html).toContain("Bitte zuerst das Diktat beenden.");
    expect(html).toContain("alle Teilnehmenden");
    expect(html).toContain("App geöffnet lassen");
  });

  it("replaces upload placeholders with the upload form and own-speaker setting", () => {
    const html = renderToStaticMarkup(<MeetingsView />);
    expect(html).toContain("Datei transkribieren");
    expect(html).toContain("Name der eigenen Stimme");
    expect(html).toContain("maximal 200 MB");
    expect(html).not.toContain("„Protokoll“");
  });

  it("shows only the latest result card in dictation", () => {
    const html = renderToStaticMarkup(<DictationView lastResult={{ text: "Beispieltext", meta: "Formal" }} onCopy={() => {}} />);
    expect(html).toContain("Letztes Ergebnis");
    expect(html).toContain("Beispieltext");
    expect(html).toContain("Kopieren");
    expect(html.match(/class="card"/g)).toHaveLength(1);
    expect(html).not.toContain("Punkt unten antippen");
    expect(html).not.toContain("Modi");
  });

  it("marks the currently selected mode when the shared selection changes", () => {
    const modes = [
      { id: "original", label: "Original", description: "Originaltext" },
      { id: "formal", label: "Formal", description: "Sachlicher Text" }
    ];
    for (const activeMode of ["original", "formal"]) {
      const html = renderToStaticMarkup(<ModesView modes={modes} activeMode={activeMode} onModeChange={() => {}} />);
      expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
      expect(html.match(/>aktiv</g)).toHaveLength(1);
      expect(html).toMatch(new RegExp(`aria-pressed="true"[^]*?${modes.find(mode => mode.id === activeMode)!.label}[^]*?>aktiv<`));
    }
  });
});
