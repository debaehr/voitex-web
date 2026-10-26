import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { OverlayBar, type OverlayMessage } from "./components/OverlayBar";
import { cx } from "./components/ui";
import { navAll, navBottom, navTop, tabSections, type NavEntry, type Section } from "./lib/nav";
import { useTheme } from "./lib/theme";
import { DictationView, type ModeInfo } from "./views/DictationView";
import { HistoryView } from "./views/HistoryView";
import { LexiconView } from "./views/LexiconView";
import { MeetingsView } from "./views/MeetingsView";
import { ProtocolView } from "./views/ProtocolView";
import { SettingsView } from "./views/SettingsView";
import { SnippetsView } from "./views/SnippetsView";

const modes: ModeInfo[] = [
  { id: "original", label: "Original", description: "Sprache in Text umwandeln, sprachlich bereinigt." },
  { id: "casual", label: "Casual", description: "Locker formuliert, z. B. für Chat-Nachrichten." },
  { id: "formal", label: "Formal", description: "Sachlich und vollständig, z. B. für E-Mails." },
  { id: "coding", label: "Coding", description: "Präzise Anweisung für Coding-Agenten." }
];

const languages = [
  { id: "auto", label: "Automatisch erkennen", short: "Auto" },
  { id: "de", label: "Deutsch (de)", short: "DE" },
  { id: "en", label: "Englisch (en)", short: "EN" }
];

// Sections with their own two-level layout fill the page body edge to edge.
const twoLevelSections: Section[] = ["meetings", "history", "settings"];

export function App() {
  const [section, setSection] = useState<Section>("dictation");
  const [moreOpen, setMoreOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const [mode, setMode] = useState("formal");
  const [language, setLanguage] = useState("de");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState<OverlayMessage | null>(null);
  const messageTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  function showMessage(next: OverlayMessage) {
    setMessage(next);
    if (messageTimer.current) window.clearTimeout(messageTimer.current);
    messageTimer.current = window.setTimeout(() => setMessage(null), 3500);
  }

  function navigate(target: Section) {
    setSection(target);
    setMoreOpen(false);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showMessage({ kind: "success", text: "In die Zwischenablage kopiert." });
    } catch {
      showMessage({ kind: "warning", text: "Kopieren nicht möglich — bitte manuell markieren." });
    }
  }

  const current = navAll.find((entry) => entry.id === section) ?? navAll[0];
  const isTwoLevel = twoLevelSections.includes(section);

  const renderNav = (entries: NavEntry[]) =>
    entries.map(({ id, label, icon: Icon }) => (
      <button key={id} type="button" className="nav-item" aria-current={section === id ? "page" : undefined} onClick={() => navigate(id)}>
        <Icon aria-hidden />
        {label}
      </button>
    ));

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">voitex</div>
        <nav className="sidebar-nav top" aria-label="Hauptnavigation">
          {renderNav(navTop)}
        </nav>
        <nav className="sidebar-nav bottom" aria-label="Einstellungen">
          {renderNav(navBottom)}
        </nav>
      </aside>

      <main className="main">
        <header className="page-header">
          <h1 className="page-title">{current.title}</h1>
          {recording ? (
            <div className="live-indicator">
              <span className="live-dot" aria-hidden />
              <span>Aufnahme läuft</span>
            </div>
          ) : null}
        </header>

        <div className="page-body" style={isTwoLevel ? { overflow: "hidden" } : undefined}>
          {section === "dictation" ? (
            <DictationView modes={modes} activeMode={mode} onModeChange={setMode} lastResult={null} onCopy={copy} />
          ) : section === "protocol" ? (
            <ProtocolView onStart={() => showMessage({ kind: "info", text: "Langzeitaufnahme folgt in einer späteren Etappe." })} />
          ) : section === "meetings" ? (
            <MeetingsView />
          ) : section === "lexicon" ? (
            <LexiconView entries={[]} />
          ) : section === "snippets" ? (
            <SnippetsView />
          ) : section === "history" ? (
            <HistoryView entries={[]} onCopy={copy} />
          ) : (
            <SettingsView theme={theme} onThemeChange={setTheme} />
          )}
        </div>

        {section !== "protocol" && section !== "settings" ? (
          <OverlayBar
            languages={languages}
            language={language}
            onLanguageChange={setLanguage}
            modes={modes}
            mode={mode}
            onModeChange={setMode}
            recording={recording}
            elapsedSeconds={elapsed}
            levels={[]}
            busyText={null}
            message={message}
            onStart={() => {
              setElapsed(0);
              setRecording(true);
            }}
            onStop={() => {
              setRecording(false);
              showMessage({ kind: "warning", text: "Diktat-Anbindung folgt in Etappe 2." });
            }}
          />
        ) : null}
      </main>

      <nav className="tabbar" aria-label="Hauptnavigation">
        {tabSections.map((id) => {
          const entry = navAll.find((item) => item.id === id)!;
          const Icon = entry.icon;
          return (
            <button key={id} type="button" className="tab" aria-current={section === id ? "page" : undefined} onClick={() => navigate(id)}>
              <Icon aria-hidden />
              {entry.label}
            </button>
          );
        })}
        <button
          type="button"
          className={cx("tab")}
          aria-expanded={moreOpen}
          aria-current={!tabSections.includes(section) ? "page" : undefined}
          onClick={() => setMoreOpen((value) => !value)}
        >
          <MoreHorizontal aria-hidden />
          Mehr
        </button>
      </nav>
      {moreOpen ? (
        <div className="more-sheet" role="menu">
          {renderNav(navAll.filter((entry) => !tabSections.includes(entry.id)))}
        </div>
      ) : null}
    </div>
  );
}
