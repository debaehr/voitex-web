import { renderToStaticMarkup } from "react-dom/server";
import { SlidersHorizontal } from "lucide-react";
import { describe, expect, it } from "vitest";
import { languages } from "../src/App";
import { navAll, navTop, tabSections } from "../src/lib/nav";
import { DictationView } from "../src/views/DictationView";
import { MeetingsView } from "../src/views/MeetingsView";
import { ModesView } from "../src/views/ModesView";
import { ProtocolView } from "../src/views/ProtocolView";

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

  it("disables long recording and explains availability beside the button", () => {
    const html = renderToStaticMarkup(<ProtocolView />);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby="long-recording-hint"/);
    expect(html).toContain('id="long-recording-hint"');
    expect(html).toContain("Langzeitaufnahme folgt in Etappe 3.");
  });

  it("points upload users to Meetings for recording", () => {
    const html = renderToStaticMarkup(<MeetingsView />);
    expect(html).toContain("0 Transkripte · Aufnahme unter „Meetings“");
    expect(html).toContain("Noch keine Transkripte.");
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
