import { targetLanguages, type TargetLanguage } from "./lib/target-languages";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./lib/api";
import { HistoryProvider, useHistory } from "./lib/history-context";
import { runDictation, snapshotDictationOptions, type DictationOptions, type DictationResult } from "./lib/dictation";
import { availableDictationModes, resolveMode } from "./lib/modes";
import { resultMeta } from "./lib/history";
import { readPreference, writePreference } from "./lib/device-preferences";
import { useRecorder } from "./lib/useRecorder";
import { useMeetingRecorder } from "./lib/useMeetingRecorder";
import { MicrophoneGate } from "./lib/microphone";
import { MoreHorizontal } from "lucide-react";
import { OverlayBar, type OverlayMessage } from "./components/OverlayBar";
import { ConfirmDialog } from "./components/Dialog";
import { SettingsProvider, useSettings } from "./lib/settings-context";
import { cx } from "./components/ui";
import { navAll, navBottom, navTop, tabSections, type NavEntry, type Section } from "./lib/nav";
import { useTheme } from "./lib/theme";
import { DictationView } from "./views/DictationView";
import { HistoryView } from "./views/HistoryView";
import { LexiconView } from "./views/LexiconView";
import { ModesView } from "./views/ModesView";
import { MeetingsView } from "./views/MeetingsView";
import { ProtocolView } from "./views/ProtocolView";
import { SettingsView } from "./views/SettingsView";
import { SnippetsView } from "./views/SnippetsView";

export { languages } from "./lib/languages";
import { languages } from "./lib/languages";

// Sections with their own two-level layout fill the page body edge to edge.
const twoLevelSections: Section[] = ["history", "settings"];

export function App() {
  return (
    <SettingsProvider>
      <HistoryProvider><AppContent /></HistoryProvider>
    </SettingsProvider>
  );
}

function AppContent() {
  const { saving, settings, status: settingsStatus } = useSettings();
  const history = useHistory();
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [pendingSection, setPendingSection] = useState<Section | null>(null);
  const [section, setSection] = useState<Section>("dictation");
  const [moreOpen, setMoreOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const modes = useMemo(() => availableDictationModes(settings), [settings]);
  // Wait for server settings before validating a saved custom id.
  const [mode, setMode] = useState("");
  const activeMode = resolveMode(mode, modes);
  const [language, setLanguage] = useState(() => readPreference("voitex-language", languages.map(item => item.id), "de"));
  const [targetLanguage, setTargetLanguage] = useState(() => readPreference("voitex-target-language", targetLanguages.map(item => item.id), "source") as TargetLanguage);
  const [busyText, setBusyText] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<DictationResult | null>(null);
  const [message, setMessage] = useState<OverlayMessage | null>(null);
  const messageTimer = useRef<number | null>(null);
  const locked = useRef(false);
  const processing = useRef(false);
  const recordingOptions = useRef<DictationOptions | null>(null);
  const [microphone] = useState(() => new MicrophoneGate());
  const meeting = useMeetingRecorder(microphone);
  const recorder = useRecorder(text => {
    locked.current = false;
    microphone.release("dictation");
    showMessage({ kind: "warning", text });
  });
  const { recording, elapsed, levels } = recorder;
  useEffect(() => {
    if (settingsStatus !== "ready") return;
    const next = mode ? resolveMode(mode, modes) :
      readPreference("voitex-mode", modes.map(item => item.id), resolveMode("formal", modes));
    if (next !== mode) setMode(next);
    writePreference("voitex-mode", next);
  }, [mode, modes, settingsStatus]);
  useEffect(() => { writePreference("voitex-language", language); }, [language]);
  useEffect(() => { writePreference("voitex-target-language", targetLanguage); }, [targetLanguage]);
  useEffect(() => () => {
    if (messageTimer.current) window.clearTimeout(messageTimer.current);
  }, []);

  async function startRecording() {
    if (locked.current || recording || busyText || meeting.state.active) return;
    if (settingsStatus !== "ready" || !settings) {
      showMessage({ kind: "warning", text: "Einstellungen konnten nicht geladen werden. Bitte die Seite neu laden." });
      return;
    }
    if (!microphone.acquire("dictation")) return;
    locked.current = true;
    recordingOptions.current = snapshotDictationOptions({ mode: activeMode, language, targetLanguage, settings });
    setMessage(null);
    setBusyText("Mikrofon wird gestartet …");
    try {
      if (!(await recorder.start())) { locked.current = false; microphone.release("dictation"); }
    } catch (error) {
      locked.current = false;
      microphone.release("dictation");
      showMessage({ kind: "warning", text: error instanceof Error ? error.message : "Aufnahme fehlgeschlagen." });
    } finally { setBusyText(null); }
  }

  async function stopRecording() {
    if (!recording || busyText || processing.current || !recordingOptions.current) return;
    processing.current = true;
    setBusyText("Transkribiere …");
    try {
      const audio = await recorder.stop();
      const result = await runDictation({ ...audio, ...recordingOptions.current, api, onStage: setBusyText });
      setLastResult(result);
      const copied = await copy(result.text, false);
      await history.add({ ...result, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
      showMessage(copied
        ? { kind: "success", text: "In die Zwischenablage kopiert." }
        : { kind: "warning", text: "Kopieren nicht möglich — Text unten kopieren" });
    } catch (error) {
      showMessage({ kind: "warning", text: error instanceof Error ? error.message : "Diktat fehlgeschlagen." });
    } finally {
      processing.current = false;
      locked.current = false;
      microphone.release("dictation");
      setBusyText(null);
    }
  }

  function showMessage(next: OverlayMessage) {
    setMessage(next);
    if (messageTimer.current) window.clearTimeout(messageTimer.current);
    messageTimer.current = window.setTimeout(() => setMessage(null), 3500);
  }

  function navigate(target: Section) {
    if (target === section) {
      setMoreOpen(false);
      return;
    }
    // An in-flight save cannot be discarded; finish it before leaving settings.
    if (section === "settings" && saving) return;
    if (section === "settings" && settingsDirty) {
      setPendingSection(target);
      return;
    }
    setSection(target);
    setMoreOpen(false);
  }

  async function copy(text: string, notify = true) {
    try {
      await navigator.clipboard.writeText(text);
      if (notify) showMessage({ kind: "success", text: "In die Zwischenablage kopiert." });
      return true;
    } catch {
      if (notify) showMessage({ kind: "warning", text: "Kopieren nicht möglich — Text unten kopieren" });
      return false;
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
      {pendingSection !== null ? (
        <ConfirmDialog
          title="Änderungen verwerfen?"
          onClose={() => setPendingSection(null)}
          onConfirm={() => {
            setSection(pendingSection);
            setPendingSection(null);
            setSettingsDirty(false);
            setMoreOpen(false);
          }}
        >
          Die Einstellungen wurden noch nicht gespeichert. Beim Verlassen gehen diese Änderungen verloren.
        </ConfirmDialog>
      ) : null}
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
          {recording || meeting.state.active || meeting.state.phase === "finishing" ? (
            <div className="live-indicator">
              <span className="live-dot" aria-hidden />
              <span>{meeting.state.active ? meeting.state.phase === "paused" ? "Meeting pausiert" : meeting.state.phase === "interrupted" ? "Meeting unterbrochen" : "Meeting-Aufnahme" : meeting.state.phase === "finishing" ? "Meeting wird gesichert" : "Aufnahme läuft"}</span>
            </div>
          ) : null}
        </header>

        <div className="page-body" style={isTwoLevel ? { overflow: "hidden" } : undefined}>
          {section === "dictation" ? (
            <DictationView lastResult={lastResult ? { text: lastResult.text, meta: resultMeta(lastResult) } : null} onCopy={copy} />
          ) : section === "protocol" ? (
            <ProtocolView state={meeting.state} controller={meeting.controller} language={language} dictationActive={recording || !!busyText} ownSpeakerName={settings?.ownSpeakerName} />
          ) : section === "meetings" ? (
            <MeetingsView language={language} />
          ) : section === "lexicon" ? (
            <LexiconView />
          ) : section === "snippets" ? (
            <SnippetsView />
          ) : section === "modes" ? (
            <ModesView modes={modes} activeMode={activeMode} onModeChange={setMode} />
          ) : section === "history" ? (
            <HistoryView />
          ) : (
            <SettingsView theme={theme} onThemeChange={setTheme} onDirtyChange={setSettingsDirty} />
          )}
        </div>

        {section !== "protocol" && section !== "settings" ? (
          <OverlayBar
            languages={languages}
            language={language}
            onLanguageChange={setLanguage}
            targetLanguage={targetLanguage}
            onTargetLanguageChange={setTargetLanguage}
            modes={modes}
            mode={activeMode}
            onModeChange={setMode}
            recording={recording}
            elapsedSeconds={elapsed}
            levels={levels}
            busyText={busyText}
            message={message}
            recordingDisabled={meeting.state.active}
            lockText={meeting.state.active ? "Meeting-Aufnahme aktiv — Diktat gesperrt." : null}
            onStart={() => { void startRecording(); }}
            onStop={() => { void stopRecording(); }}
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
