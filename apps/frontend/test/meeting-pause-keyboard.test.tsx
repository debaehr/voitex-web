import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (value: unknown) => [value, vi.fn()],
}));
const preferences = vi.hoisted(() => ({ settings: { dictationSpacePause: true } }));
vi.mock("../src/lib/settings-context", () => ({ useSettings: () => preferences }));
import { ProtocolView } from "../src/views/ProtocolView";
import { initialMeetingSnapshot, type MeetingRecorder, type MeetingSnapshot } from "../src/lib/meeting-recorder";

function elements(node: ReactNode): ReactElement<any>[] {
  return Children.toArray(node).flatMap(child => isValidElement<any>(child)
    ? [child, ...elements(child.props.children)] : []);
}
function setup(phase: MeetingSnapshot["phase"] = "recording") {
  const controller = { pause: vi.fn(), resume: vi.fn(), finish: vi.fn() };
  const nodes = elements(ProtocolView({ state: { ...initialMeetingSnapshot, phase },
    controller: controller as unknown as MeetingRecorder, language: "de", dictationActive: false }));
  const card = nodes.find(node => node.props["aria-label"] === "Meeting-Aufnahme")!;
  return { controller, card, nodes };
}
function key(card: ReactElement<any>, overrides = {}) {
  const event = { key: " ", repeat: false, target: { closest: () => null },
    currentTarget: { contains: () => true }, preventDefault: vi.fn(), ...overrides };
  card.props.onKeyDown(event);
  return event;
}
beforeEach(() => { preferences.settings.dictationSpacePause = true; });
it.each(["recording", "paused"] as const)("toggles %s only and prevents native finish button activation", phase => {
  const { card, controller, nodes } = setup(phase);
  const finish = nodes.find(node => Children.toArray(node.props.children).includes("Beenden"))!;
  expect(finish).toBeDefined();
  // A button target has no editor ancestor. Cancellation stops the browser's Space click.
  const event = key(card, { target: { tagName: "BUTTON", closest: () => null } });
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(controller.pause).toHaveBeenCalledTimes(phase === "recording" ? 1 : 0);
  expect(controller.resume).toHaveBeenCalledTimes(phase === "paused" ? 1 : 0);
  expect(controller.finish).not.toHaveBeenCalled();
});
it.each(["disabled", "outside", "repeat", "altKey", "ctrlKey", "metaKey", "shiftKey", "other-key"])("ignores Space for %s", reason => {
  const { card, controller } = setup();
  preferences.settings.dictationSpacePause = reason !== "disabled";
  const event = key(card, reason === "outside" ? { currentTarget: { contains: () => false } }
    : reason === "other-key" ? { key: "Enter" } : { [reason]: true });
  expect(controller.pause).not.toHaveBeenCalled();
  expect(event.preventDefault).not.toHaveBeenCalled();
});
it.each(["input", "textarea", "select", "contenteditable", "nested editor"])("preserves typing in %s", editor => {
  const { card, controller } = setup();
  const closest = vi.fn(() => ({ editor }));
  const event = key(card, { target: { closest } });
  expect(closest).toHaveBeenCalledWith('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
  expect(controller.pause).not.toHaveBeenCalled();
  expect(event.preventDefault).not.toHaveBeenCalled();
});
it.each(["interrupted", "recovery", "finishing"] as const)("does not toggle in %s", phase => {
  const { card, controller } = setup(phase);
  const event = key(card);
  expect(controller.pause).not.toHaveBeenCalled(); expect(controller.resume).not.toHaveBeenCalled();
  expect(event.preventDefault).not.toHaveBeenCalled();
});
