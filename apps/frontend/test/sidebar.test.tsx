import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const h = vi.hoisted(() => ({ slots: [] as any[], cursor: 0 }));
vi.mock("react", async original => ({ ...await original<any>(),
  useState: (initial: any) => { const i = h.cursor++; if (!(i in h.slots)) h.slots[i] = typeof initial === "function" ? initial() : initial; return [h.slots[i], (value: any) => { h.slots[i] = value; }]; },
  useRef: (initial: any) => { const i = h.cursor++; return h.slots[i] ??= { current: initial }; },
  useMemo: (fn: () => any) => fn(), useEffect: vi.fn(),
}));
vi.mock("../src/lib/settings-context", () => ({ SettingsProvider: () => null, SettingsNotice: () => null,
  useSettings: () => ({ settings: null, saving: false, status: "loading", providers: null }) }));
vi.mock("../src/lib/history-context", () => ({ HistoryProvider: () => null, useHistory: () => ({ add: vi.fn() }) }));
vi.mock("../src/lib/useRecorder", () => ({ useRecorder: () => ({ recording: false, levels: [] }) }));
vi.mock("../src/lib/useMeetingRecorder", () => ({ useMeetingRecorder: () => ({ state: { active: false, phase: "idle" } }) }));
vi.mock("../src/lib/theme", () => ({ useTheme: () => ["light", vi.fn()] }));
import { App } from "../src/App";
import { readSidebarCollapsed } from "../src/lib/sidebar";
function find(node: any, match: (node: any) => boolean): any {
  if (!node || typeof node !== "object") return;
  if (match(node)) return node;
  return [node.props?.children].flat(Infinity).map(child => find(child, match)).find(Boolean);
}
function render() { h.cursor = 0; const content = App().props.children.props.children; return content.type(); }
function toggle() { return find(render(), n => n.type === "button" && n.props["aria-label"]?.startsWith("Menü ")).props; }
let storage: Map<string, string>;
beforeEach(() => {
  h.slots = []; h.cursor = 0; storage = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  vi.stubGlobal("window", { innerWidth: 1280 });
});
afterEach(() => { vi.unstubAllGlobals(); });
it.each([[1099, true], [1100, false], [768, true], [1440, false]])("defaults at width %s to collapsed=%s", (width, collapsed) => {
  window.innerWidth = width as number; expect(readSidebarCollapsed()).toBe(collapsed);
  expect(toggle()["aria-expanded"]).toBe(!collapsed);
});
it("toggles both directions, remembers the device choice and retains active names and tooltips", () => {
  expect(toggle()["aria-label"]).toBe("Menü einklappen"); toggle().onClick();
  expect(toggle()["aria-label"]).toBe("Menü ausklappen"); expect(toggle()["aria-expanded"]).toBe(false);
  expect(render().props.className).toContain("sidebar-collapsed");
  expect(storage.get("voitex-sidebar-collapsed")).toBe("true");
  h.slots = []; expect(toggle()["aria-expanded"]).toBe(false);
  const active = find(render(), n => n.type === "button" && n.props["aria-current"] === "page");
  expect(active.props).toMatchObject({ "aria-label": "Diktat", title: "Diktat" });
  const bottom = find(render(), n => n.type === "nav" && n.props.className === "sidebar-nav bottom");
  expect(find(bottom, n => n.type === "button").props["aria-label"]).toBe("Einstellungen");
  toggle().onClick(); expect(toggle()["aria-expanded"]).toBe(true); expect(storage.get("voitex-sidebar-collapsed")).toBe("false");
});
it("honors an explicit expanded choice below 1100px and works when storage is blocked", () => {
  window.innerWidth = 900; storage.set("voitex-sidebar-collapsed", "false"); expect(readSidebarCollapsed()).toBe(false);
  vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
  expect(readSidebarCollapsed()).toBe(true); expect(() => toggle().onClick()).not.toThrow(); expect(toggle()["aria-expanded"]).toBe(true);
});
it("keeps the mobile tabs and 56px rail and disables width transitions for reduced motion", () => {
  const tabs = find(render(), n => n.props?.className === "tabbar");
  expect(tabs.props.children[0]).toHaveLength(4); expect(tabs.props.children[1].props.children[1]).toBe("Mehr");
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  expect(css).toContain("--sidebar-width: 56px");
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.sidebar \{ transition: none;/);
  expect(css).toMatch(/@media \(max-width: 767px\)\s*\{\s*\.sidebar \{\s*display: none;/);
});
