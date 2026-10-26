import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button, cx } from "./ui";
interface DialogProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  compact?: boolean;
}
export function Dialog({ title, children, onClose, compact }: DialogProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const siblings = [...document.body.children].filter(
      (node): node is HTMLElement =>
        node instanceof HTMLElement && node !== backdrop.current,
    );
    const previousInert = siblings.map((node) => node.inert);
    siblings.forEach((node) => {
      node.inert = true;
    });
    const focusable = () =>
      [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          "button, input, select, textarea, a[href], [tabindex]",
        ) ?? []),
      ].filter(
        (node) =>
          !node.matches(':disabled, [hidden], [tabindex="-1"]') &&
          node.getClientRects().length > 0,
      );
    // Focus the first form field; dialogs without fields focus their first available control.
    const first =
      panel.current?.querySelector<HTMLElement>(
        "input:not(:disabled), textarea:not(:disabled), select:not(:disabled)",
      ) ??
      focusable()[0] ??
      panel.current;
    first?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable(),
        start = elements[0],
        end = elements[elements.length - 1];
      if (!start) {
        event.preventDefault();
        panel.current?.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === start ||
          !elements.includes(document.activeElement as HTMLElement))
      ) {
        event.preventDefault();
        end.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === end ||
          !elements.includes(document.activeElement as HTMLElement))
      ) {
        event.preventDefault();
        start.focus();
      }
    }
    function onFocus(event: FocusEvent) {
      if (!panel.current?.contains(event.target as Node))
        (focusable()[0] ?? panel.current)?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocus);
      document.body.style.overflow = previousOverflow;
      siblings.forEach((node, index) => {
        node.inert = previousInert[index];
      });
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return createPortal(
    <div
      className="dialog-backdrop"
      ref={backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        className={cx("card dialog-panel", compact && "dialog-compact")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="dialog-head">
          <h2 id={titleId} className="card-title">
            {title}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dialog schließen"
            onClick={onClose}
          >
            <X aria-hidden />
          </Button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
export function ConfirmDialog({
  title,
  children,
  onClose,
  onConfirm,
  confirmLabel = "Verwerfen",
}: Omit<DialogProps, "compact"> & {
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  return (
    <Dialog title={title} onClose={onClose} compact>
      <p>{children}</p>
      <div className="dialog-actions">
        <Button variant="outline" onClick={onClose}>
          Abbrechen
        </Button>
        <Button variant="destructive" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
