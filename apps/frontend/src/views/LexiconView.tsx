import { EntryListView } from "./EntryListView";
export type { LexiconEntry as LexiconRow } from "../lib/types";
export function LexiconView() {
  return <EntryListView kind="lexicon" />;
}
