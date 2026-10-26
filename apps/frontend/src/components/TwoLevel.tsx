import type { ReactNode } from "react";
import { ChevronLeft, Trash2 } from "lucide-react";
import { Button, cx } from "./ui";

// Second navigation band on the left, detail on the right (voitex ZweiEbenenShell).
// On phones only one level is visible at a time; `onBack` returns to the list.

export interface BandEntry {
  id: string;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  onDelete?: () => void;
}

interface TwoLevelProps {
  entries: BandEntry[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onBack: () => void;
  bandHead?: ReactNode;
  empty?: ReactNode;
  children?: ReactNode;
}

export function TwoLevel({ entries, activeId, onSelect, onBack, bandHead, empty, children }: TwoLevelProps) {
  return (
    <div className={cx("two-level", activeId !== null && "has-selection")}>
      <div className="band">
        {bandHead ? <div className="band-head">{bandHead}</div> : null}
        <nav className="band-list">
          {/* On phones the detail pane is hidden, so the empty hint must live in the band. */}
          {entries.length === 0 ? <p className="band-empty">{empty}</p> : null}
          {entries.map((entry) => (
            <div key={entry.id} className={cx("band-item", activeId === entry.id && "active")}>
              <button
                type="button"
                className="band-item-main"
                aria-current={activeId === entry.id ? "true" : undefined}
                onClick={() => onSelect(entry.id)}
              >
                <span className="band-item-title">
                  <span>{entry.title}</span>
                  {entry.badge}
                </span>
                {entry.subtitle ? <span className="band-item-sub">{entry.subtitle}</span> : null}
              </button>
              {entry.onDelete ? (
                <button type="button" className="band-item-delete" title="Löschen" aria-label={`${entry.title} löschen`} onClick={entry.onDelete}>
                  <Trash2 />
                </button>
              ) : null}
            </div>
          ))}
        </nav>
      </div>
      <div className="detail">
        {activeId !== null ? (
          <div className="detail-inner">
            <Button variant="ghost" size="sm" className="detail-back" onClick={onBack}>
              <ChevronLeft /> Zurück
            </Button>
            {children}
          </div>
        ) : (
          <div className="detail-empty">{empty ?? "Links einen Eintrag wählen."}</div>
        )}
      </div>
    </div>
  );
}
