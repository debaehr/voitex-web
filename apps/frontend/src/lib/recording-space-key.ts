import type { KeyboardEvent } from "react";

export function isRecordingSpaceKey(event: KeyboardEvent<HTMLElement>): boolean {
  // Keep the shortcut local and preserve typing in native and nested editors.
  const target = event.target as HTMLElement;
  return event.key === " " && !event.repeat && !event.altKey && !event.ctrlKey &&
    !event.metaKey && !event.shiftKey && event.currentTarget.contains(target) &&
    !target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
}
