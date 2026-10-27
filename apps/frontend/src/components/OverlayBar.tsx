import { targetLanguages, type TargetLanguage } from "../lib/target-languages";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronDown } from "lucide-react";

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
  elapsedSeconds: number;
  /** Normalised input levels 0..1, newest last; empty while no signal arrives. */
  levels: number[];
  busyText: string | null;
  message: OverlayMessage | null;
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
    <div className="overlay" ref={rootRef}>
      {menu && !props.recording && !props.busyText ? (
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
              {option.label}
              {option.id === menuValue ? <Check className="check" size={16} /> : null}
            </button>
          ))}
        </div>
      ) : null}

      {props.message && !props.recording && !props.busyText ? (
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
      ) : props.recording ? (
        <div className="capsule overlay-recording">
          <span className="overlay-time">{formatClock(props.elapsedSeconds)}</span>
          <Wave levels={props.levels} />
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
            onClick={() => setMenu(menu === "mode" ? null : "mode")}
          >
            {activeMode?.label}<ChevronDown aria-hidden />
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
            <button type="button" className="capsule overlay-dot" aria-label="Diktat starten" onClick={props.onStart}>
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
