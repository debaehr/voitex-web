import type { ComponentProps, ReactNode } from "react";

// Small primitives in the style of voitex' hand-written shadcn components,
// translated from Tailwind classes to the plain CSS in styles.css.

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "default" | "destructive" | "outline" | "ghost" | "secondary";
type ButtonSize = "default" | "sm" | "icon";

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}

export function Button({ variant = "default", size = "default", block, className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "btn",
        `btn-${variant}`,
        size === "sm" && "btn-sm",
        size === "icon" && "btn-icon",
        block && "btn-block",
        className
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("card", className)} {...props} />;
}

export function CardHeader({ className, actions, children, ...props }: ComponentProps<"div"> & { actions?: ReactNode }) {
  if (actions) {
    return (
      <div className={cx("card-header row", className)} {...props}>
        <div className="stack" style={{ gap: 4 }}>
          {children}
        </div>
        {actions}
      </div>
    );
  }
  return (
    <div className={cx("card-header", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 className={cx("card-title", className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cx("card-description", className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("card-content", className)} {...props} />;
}

type BadgeVariant = "secondary" | "outline" | "success";

export function Badge({ variant = "secondary", className, ...props }: ComponentProps<"span"> & { variant?: BadgeVariant }) {
  return <span className={cx("badge", `badge-${variant}`, className)} {...props} />;
}

export function Field({
  label,
  hint,
  htmlFor,
  children
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx("input", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx("textarea", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx("select", className)} {...props} />;
}

// Native checkbox underneath, so keyboard and screen readers work without extra code.
export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="switch" style={disabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      <span className="switch-track" />
      <span className="switch-thumb" />
    </label>
  );
}

// A titled setting with description on the left and a control on the right.
export function SettingRow({ title, description, control }: { title: ReactNode; description?: ReactNode; control: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="stack" style={{ gap: 2 }}>
        <span className="field-label">{title}</span>
        {description ? <span className="field-hint">{description}</span> : null}
      </div>
      {control}
    </div>
  );
}
