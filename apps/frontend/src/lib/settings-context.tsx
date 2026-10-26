import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { SettingsStore, type SettingsState } from "./settings-store";
import type { Settings } from "./types";
interface SettingsContextValue extends SettingsState {
  save: (next: Settings) => Promise<void>;
}
const Context = createContext<SettingsContextValue | null>(null);
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new SettingsStore());
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    void store.load();
  }, [store]);
  return (
    <Context.Provider value={{ ...state, save: store.save }}>
      {children}
    </Context.Provider>
  );
}
export function useSettings(): SettingsContextValue {
  const context = useContext(Context);
  if (!context) throw new Error("SettingsProvider fehlt.");
  return context;
}
export function SettingsNotice() {
  const { status, error } = useSettings();
  if (status === "ready") return null;
  return (
    <p className="data-notice" role={status === "error" ? "alert" : "status"}>
      {status === "loading"
        ? "Einstellungen werden geladen …"
        : `Einstellungen konnten nicht geladen werden: ${error} Speichern ist gesperrt. Bitte die Seite neu laden.`}
    </p>
  );
}
