import { BookOpen, FileText, History, Mic, NotebookPen, Settings, Users, type LucideIcon } from "lucide-react";

export type Section = "dictation" | "protocol" | "meetings" | "lexicon" | "snippets" | "history" | "settings";

export interface NavEntry {
  id: Section;
  label: string;
  title: string;
  icon: LucideIcon;
}

export const navTop: NavEntry[] = [
  { id: "dictation", label: "Diktat", title: "Diktat", icon: Mic },
  { id: "protocol", label: "Protokoll", title: "Protokoll", icon: NotebookPen },
  { id: "meetings", label: "Meetings", title: "Meetings", icon: Users },
  { id: "lexicon", label: "Lexikon", title: "Lexikon", icon: BookOpen },
  { id: "snippets", label: "Snippets", title: "Snippets", icon: FileText },
  { id: "history", label: "Verlauf", title: "Verlauf", icon: History }
];

export const navBottom: NavEntry[] = [{ id: "settings", label: "Einstellungen", title: "Einstellungen", icon: Settings }];

export const navAll = [...navTop, ...navBottom];

// Phone tab bar: the four most used sections; the rest sits behind "Mehr".
export const tabSections: Section[] = ["dictation", "protocol", "meetings", "history"];
