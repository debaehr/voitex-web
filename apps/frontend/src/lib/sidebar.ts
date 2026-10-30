const storageKey = "voitex-sidebar-collapsed";
export function readSidebarCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === "true" || stored === "false") return stored === "true";
  } catch { /* Device storage can be unavailable in private browsing. */ }
  return typeof window !== "undefined" && window.innerWidth < 1100;
}
export function writeSidebarCollapsed(collapsed: boolean) {
  try { localStorage.setItem(storageKey, String(collapsed)); }
  catch { /* The toggle remains usable without persistence. */ }
}
