import { afterEach, beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  slots: [] as any[], cursor: 0,
  state: { recording: false, paused: false, interrupted: false },
  start: vi.fn(), stop: vi.fn(), pause: vi.fn(), resume: vi.fn(), discard: vi.fn(),
  run: vi.fn(), add: vi.fn(), save: vi.fn(),
}));
vi.mock("react", () => ({
  useState: (initial: any) => {
    const index = h.cursor++;
    if (!(index in h.slots)) h.slots[index] = typeof initial === "function" ? initial() : initial;
    return [h.slots[index], (value: any) => { h.slots[index] = value; }];
  },
  useRef: (initial: any) => {
    const index = h.cursor++; return h.slots[index] ??= { current: initial };
  },
  useMemo: (fn: () => any) => fn(), useEffect: vi.fn(),
}));
vi.mock("../src/lib/settings-context", () => ({
  SettingsProvider: () => null, SettingsNotice: () => null,
  useSettings: () => ({ status: "ready", saving: false,
    settings: { dictationSpacePause: true, providers: { formal: "mistral" }, prompts: { formal: "Prompt" }, lexicon: [], snippets: [] },
    defaults: { prompts: {} }, providers: { stt: ["mistral"] }, save: h.save }),
}));
vi.mock("../src/lib/history-context", () => ({ HistoryProvider: () => null, useHistory: () => ({ add: h.add }) }));
vi.mock("../src/lib/useRecorder", () => ({ useRecorder: () => ({ ...h.state,
  elapsed: 2, levels: [], pauseSupported: true, start: h.start, stop: h.stop,
  pause: h.pause, resume: h.resume, discard: h.discard }) }));
vi.mock("../src/lib/useMeetingRecorder", () => ({ useMeetingRecorder: () => ({ state: { active: false, phase: "idle" }, controller: null }) }));
vi.mock("../src/lib/theme", () => ({ useTheme: () => ["light", vi.fn()] }));
vi.mock("../src/lib/dictation", async importOriginal => ({ ...await importOriginal<any>(), runDictation: h.run }));
import { App } from "../src/App";
import { OverlayBar } from "../src/components/OverlayBar";
import { ProtocolView } from "../src/views/ProtocolView";
import { SettingsView } from "../src/views/SettingsView";
import { Switch, Button } from "../src/components/ui";
import { ModesView } from "../src/views/ModesView";
function find(node: any, match: (node: any) => boolean): any {
  if (!node || typeof node !== "object") return;
  if (match(node)) return node;
  return [node.props?.children].flat(Infinity).map(child => find(child, match)).find(Boolean);
}
function render() {
  h.cursor = 0;
  const content = App().props.children.props.children;
  return content.type();
}
function overlay() { return find(render(), n => n.type === OverlayBar).props; }
function navigate(label: string) { find(render(), n => n.type === "button" && n.props.children?.[1] === label).props.onClick(); }
beforeEach(() => {
  h.slots = []; h.cursor = 0; h.state = { recording: false, paused: false, interrupted: false };
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => {}) } });
  h.start.mockResolvedValue(true);
  h.stop.mockResolvedValue({ audio: new Blob(["both sections"]), durationSeconds: 2 });
  h.run.mockResolvedValue({ text: "Beide Abschnitte", raw: "Beide Abschnitte", mode: "formal", provider: "Mistral", durationSeconds: 2 });
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
it.each([false, true])("uses the existing transcription and history flow on stop, interrupted=%s", async interrupted => {
  overlay().onStart();
  await vi.waitFor(() => expect(overlay().busyText).toBeNull());
  h.state = { recording: !interrupted, paused: !interrupted, interrupted };
  const bar = overlay(); expect(bar.dictationSpacePause).toBe(true);
  bar.onStop();
  await vi.waitFor(() => expect(h.add).toHaveBeenCalledTimes(1));
  expect(h.run).toHaveBeenCalledTimes(1);
  expect(h.run.mock.calls[0][0]).toMatchObject({ durationSeconds: 2 });
  expect(await h.run.mock.calls[0][0].audio.text()).toBe("both sections");
});
it("keeps paused dictation controls reachable and meeting/mode controls locked across navigation", () => {
  h.state = { recording: true, paused: true, interrupted: false };
  overlay().onPauseToggle(); expect(h.resume).toHaveBeenCalledOnce();
  navigate("Meetings");
  expect(find(render(), n => n.type === ProtocolView).props.dictationActive).toBe(true);
  expect(overlay().paused).toBe(true);
  navigate("Modi");
  expect(find(render(), n => n.type === ModesView).props.disabled).toBe(true);
});
it("discards recovery without calling the transcription flow and releases the microphone gate", async () => {
  overlay().onStart(); await vi.waitFor(() => expect(overlay().busyText).toBeNull());
  h.state = { recording: false, paused: false, interrupted: true };
  overlay().onDiscard(); expect(h.discard).toHaveBeenCalledOnce(); expect(h.run).not.toHaveBeenCalled();
  h.state.interrupted = false;
  overlay().onStart(); await vi.waitFor(() => expect(h.start).toHaveBeenCalledTimes(2));
});

it("edits and saves the space pause setting from the Diktat settings section", async () => {
  h.slots = ["dictation"];
  const renderSettings = () => {
    h.cursor = 0;
    return SettingsView({ theme: "light", onThemeChange: vi.fn(), onDirtyChange: vi.fn() });
  };
  const setting = find(renderSettings(), n => n.props?.control?.type === Switch).props.control;
  expect(setting.props.label).toBe("Leertaste pausiert und setzt das Diktat fort");
  expect(setting.props.checked).toBe(true);
  setting.props.onCheckedChange(false);
  const tree = renderSettings();
  // The save button is in TwoLevel's bandHead rather than its body children.
  const twoLevel = find(tree, n => !!n.props?.bandHead);
  const save = find(twoLevel.props.bandHead, n => n.type === Button);
  expect(save.props.disabled).toBe(false); save.props.onClick();
  await vi.waitFor(() => expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ dictationSpacePause: false })));
});
