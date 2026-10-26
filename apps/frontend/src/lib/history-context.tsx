import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { HistoryStore } from "./history-store";
const Context = createContext<HistoryStore | null>(null);
export function HistoryProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new HistoryStore());
  useEffect(() => { void store.load(); }, [store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useHistory() {
  const store = useContext(Context);
  if (!store) throw new Error("HistoryProvider fehlt.");
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { ...state, add: store.add, remove: store.remove, clear: store.clear };
}
