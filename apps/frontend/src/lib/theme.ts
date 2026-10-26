import { useEffect, useState } from "react";

// Theme is a per-device preference (an office PC and a phone may differ), so it
// lives in localStorage and not in the server-side settings.
export type ThemePreference = "system" | "light" | "dark";

const storageKey = "voitex-web:theme";

function readPreference(): ThemePreference {
  try {
    const saved = window.localStorage.getItem(storageKey);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

export function useTheme(): [ThemePreference, (value: ThemePreference) => void] {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = preference === "dark" || (preference === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#252525" : "#fafafa");
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);

  const update = (value: ThemePreference) => {
    setPreference(value);
    try {
      window.localStorage.setItem(storageKey, value);
    } catch {
      // Private mode: the choice simply lasts for this session.
    }
  };

  return [preference, update];
}
