import { isRecordingSpaceKey } from "../lib/recording-space-key";
import { targetLanguages, type TargetLanguage } from "../lib/target-languages";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Pause, Play } from "lucide-react";

// Floating capsule bar at the bottom of the main area, modelled on voitex'
// overlay.html: mode above record, source left and target right; while recording a
// capsule with time, level wave and stop; afterwards a short status text.

export interface OverlayOption {
  id: string;
  label: string;
  short?: string;
}

export interface OverlayMessage {
  kind: "info" | "success" | "warning";
  text: string;
}

interface OverlayBarProps {
  languages: OverlayOption[];
  language: string;
  onLanguageChange: (id: string) => void;
  targetLanguage: TargetLanguage;
  onTargetLanguageChange: (id: TargetLanguage) => void;
  modes: OverlayOption[];
  mode: string;
  onModeChange: (id: string) => void;
  recording: boolean;
  paused?: boolean;
  interrupted?: boolean;
  pauseSupported?: boolean;
  dictationSpacePause?: boolean;
  onPauseToggle?: () => void;
  onDiscard?: () => void;
  elapsedSeconds: number;
  /** Normalised input levels 0..1, newest last; empty while no signal arrives. */
  levels: number[];
  busyText: string | null;
  message: OverlayMessage | null;
  recordingDisabled?: boolean;
  lockText?: string | null;
  onStart: () => void;
  onStop: () => void;
}

const waveBars = 18;

export function OverlayBar(props: OverlayBarProps) {
  const [menu, setMenu] = useState<"language" | "mode" | "target" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close an open menu on outside click or Escape, like a native dropdown.
  useEffect(() => {
    if (!menu) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const activeLanguage = props.languages.find((item) => item.id === props.language);
  const activeMode = props.modes.find(item => item.id === props.mode);
  const activeTarget = targetLanguages.find(item => item.id === props.targetLanguage);
  const menuOptions = menu === "language" ? props.languages : menu === "target" ? targetLanguages : props.modes;
  const menuValue = menu === "language" ? props.language : menu === "target" ? props.targetLanguage : props.mode;

  return (
    <div className="overlay" ref={rootRef} role="group" tabIndex={0} aria-label="Diktataufnahme" onKeyDown={event => {
      // Handle Space here so typing elsewhere never controls the microphone.
      if (!isRecordingSpaceKey(event) || !props.dictationSpacePause ||
        !props.recording || !props.pauseSupported || props.busyText) return;
      event.preventDefault(); props.onPauseToggle?.();
    }}>
      {props.lockText ? <div id="dictation-lock" className="capsule overlay-text" role="status">{props.lockText}</div> : null}
      {menu && !props.recording && !props.interrupted && !props.busyText ? (
        <div className="capsule overlay-menu" role="menu" aria-label={menu === "language" ? "Aufnahmesprache" : menu === "target" ? "Zielsprache" : "Modus"}>
          {menuOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={option.id === menuValue}
              className="overlay-menu-item"
              onClick={() => {
                if (menu === "language") props.onLanguageChange(option.id);
                else if (menu === "target") props.onTargetLanguageChange(option.id as TargetLanguage);
                else props.onModeChange(option.id);
                setMenu(null);
              }}
            >
              <span className="overlay-option-label">{option.label}</span>
              {option.id === menuValue ? <Check className="check" size={16} /> : null}
            </button>
          ))}
        </div>
      ) : null}

      {props.message && !props.recording && !props.interrupted && !props.busyText ? (
        <div className="capsule overlay-text" role="status">
          {props.message.kind === "warning" ? <AlertTriangle className="warn" /> : null}
          {props.message.kind === "success" ? <CheckCircle2 className="ok" /> : null}
          {props.message.text}
        </div>
      ) : null}

      {props.busyText ? (
        <div className="capsule overlay-text" role="status" aria-live="polite">
          {props.busyText}
        </div>
      ) : props.interrupted ? (
        <div className="capsule overlay-recovery" role="alert">
          <span>Aufnahme wurde unterbrochen — bisherige Aufnahme verarbeiten / verwerfen</span>
          <div className="row wrap">
            <button type="button" className="overlay-recovery-action" onClick={props.onStop}>Bisherige Aufnahme verarbeiten</button>
            <button type="button" className="overlay-recovery-action" onClick={props.onDiscard}>Verwerfen</button>
          </div>
        </div>
      ) : props.recording ? (
        <div className="capsule overlay-recording">
          <span className={`overlay-time${props.paused ? " is-paused" : ""}`}>{formatClock(props.elapsedSeconds)}</span>
          {props.paused ? <span className="overlay-paused" role="status">Pausiert</span> : <Wave levels={props.levels} />}
          {props.pauseSupported ? <button type="button" className="overlay-pause"
            aria-label={props.paused ? "Diktat fortsetzen" : "Diktat pausieren"} onClick={props.onPauseToggle}>
            {props.paused ? <Play size={18} aria-hidden /> : <Pause size={18} aria-hidden />}
          </button> : null}
          <button type="button" className="overlay-stop" aria-label="Aufnahme beenden" onClick={props.onStop}>
            <span />
          </button>
        </div>
      ) : (
        <div className="overlay-controls">
          <button
            type="button"
            className="capsule overlay-chip overlay-mode"
            aria-label="Modus wählen"
            aria-expanded={menu === "mode"}
            aria-haspopup="menu"
            title={activeMode?.label}
            onClick={() => setMenu(menu === "mode" ? null : "mode")}
          >
            <span className="overlay-mode-label">{activeMode?.label}</span><ChevronDown aria-hidden />
          </button>
          <div className="overlay-row">
            <button
              type="button"
              className="capsule overlay-chip"
              aria-label="Diktatsprache wählen"
              aria-haspopup="menu"
              aria-expanded={menu === "language"}
              onClick={() => setMenu(menu === "language" ? null : "language")}
            >
              {activeLanguage?.short ?? "Auto"}<ChevronDown aria-hidden />
            </button>
            <button type="button" className="capsule overlay-dot" aria-label="Diktat starten" disabled={props.recordingDisabled} aria-describedby={props.recordingDisabled ? "dictation-lock" : undefined} onClick={props.onStart}>
              <span className="core" />
            </button>
            <button
              type="button"
              className="capsule overlay-chip"
              aria-label="Zielsprache wählen"
              aria-haspopup="menu"
              aria-expanded={menu === "target"}
              onClick={() => setMenu(menu === "target" ? null : "target")}
            >
              {activeTarget?.short ?? "="}<ChevronDown aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Wave({ levels }: { levels: number[] }) {
  const recent = levels.slice(-waveBars);
  // Without a signal the bars breathe quietly instead of faking speech activity.
  const idle = recent.length === 0;
  return (
    <div className="overlay-wave" aria-hidden>
      {Array.from({ length: waveBars }, (_, index) => {
        const level = recent[index - (waveBars - recent.length)] ?? 0;
        return <i key={index} style={idle ? undefined : { height: `${4 + Math.round(level * 20)}px` }} />;
      })}
    </div>
  );
}

export function formatClock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mmss = `${hours > 0 ? String(minutes).padStart(2, "0") : minutes}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${mmss}` : mmss;
}
