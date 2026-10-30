import { expect, it, vi } from "vitest";
vi.mock("react", () => ({
  useState: (value: unknown) => [value, vi.fn()],
  useRef: (value: unknown) => ({ current: value }), useEffect: vi.fn(),
}));
import { OverlayBar } from "../src/components/OverlayBar";
const props = {
  languages: [], language: "de", onLanguageChange: vi.fn(), targetLanguage: "source" as const,
  onTargetLanguageChange: vi.fn(), modes: [], mode: "formal", onModeChange: vi.fn(),
  recording: true, elapsedSeconds: 0, levels: [], busyText: null, message: null,
  pauseSupported: true, dictationSpacePause: true, onStart: vi.fn(), onStop: vi.fn(),
};
it.each([
  { enabled: true, inside: true, repeat: false, supported: true, recording: true, expected: true },
  { enabled: false, inside: true, repeat: false, supported: true, recording: true, expected: false },
  { enabled: true, inside: false, repeat: false, supported: true, recording: true, expected: false },
  { enabled: true, inside: true, repeat: true, supported: true, recording: true, expected: false },
  { enabled: true, inside: true, repeat: false, supported: false, recording: true, expected: false },
  { enabled: true, inside: true, repeat: false, supported: true, recording: false, expected: false },
])("scopes space pause to enabled overlay focus: %j", state => {
  const toggle = vi.fn(), preventDefault = vi.fn();
  const element = OverlayBar({ ...props, recording: state.recording, pauseSupported: state.supported,
    dictationSpacePause: state.enabled, onPauseToggle: toggle });
  element.props.onKeyDown({ key: " ", repeat: state.repeat, target: {},
    currentTarget: { contains: () => state.inside }, preventDefault });
  expect(toggle).toHaveBeenCalledTimes(state.expected ? 1 : 0);
  expect(preventDefault).toHaveBeenCalledTimes(state.expected ? 1 : 0);
});
it("wires both recovery actions and pause/resume buttons to their callbacks", () => {
  const toggle = vi.fn(), stop = vi.fn(), discard = vi.fn();
  const find = (node: any, label: string): any => {
    if (!node || typeof node !== "object") return;
    if (node.type === "button" && (node.props["aria-label"] === label || node.props.children === label)) return node;
    return [node.props?.children].flat(Infinity).map(child => find(child, label)).find(Boolean);
  };
  for (const paused of [false, true]) {
    const tree = OverlayBar({ ...props, paused, onPauseToggle: toggle, onStop: stop });
    find(tree, paused ? "Diktat fortsetzen" : "Diktat pausieren").props.onClick();
    find(tree, "Aufnahme beenden").props.onClick();
  }
  expect(toggle).toHaveBeenCalledTimes(2); expect(stop).toHaveBeenCalledTimes(2);
  const tree = OverlayBar({ ...props, recording: false, interrupted: true, onStop: stop, onDiscard: discard });
  find(tree, "Bisherige Aufnahme verarbeiten").props.onClick(); find(tree, "Verwerfen").props.onClick();
  expect(stop).toHaveBeenCalledTimes(3); expect(discard).toHaveBeenCalledTimes(1);
});
