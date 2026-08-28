/* TimeVault UI kit — accessible primitives shared by every page. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { I, type IconName } from "./icons";
import { cx } from "../lib/utils";
import type { DisplayStatus } from "../lib/invoice";

export const navigate = (hash: string): void => {
  window.location.hash = hash;
};

/* ---------------- timing ---------------- */

export function useNow(interval: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (interval <= 0) return;
    const id = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(id);
  }, [interval]);
  return now;
}

/* ---------------- buttons ---------------- */

type BtnVariant = "primary" | "outline" | "ghost" | "danger" | "soft" | "amber";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap overflow-hidden text-ellipsis max-w-full";

const btnVariants: Record<BtnVariant, string> = {
  primary: "bg-accent text-onaccent shadow-sm hover:opacity-92",
  outline: "border border-line bg-surface text-ink hover:border-accent/60 hover:text-accent",
  ghost: "text-ink2 hover:bg-surface2 hover:text-ink",
  danger: "bg-danger text-white shadow-sm hover:opacity-92",
  soft: "bg-accent/10 text-accent hover:bg-accent/18",
  amber: "bg-amber text-onamber shadow-sm hover:opacity-92",
};

const btnSizes = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  loading,
  className,
  children,
  type = "button",
  ...rest
}: {
  variant?: BtnVariant;
  size?: keyof typeof btnSizes;
  icon?: IconName;
  loading?: boolean;
  className?: string;
  children?: ReactNode;
  type?: "button" | "submit";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cx(btnBase, btnVariants[variant], btnSizes[size], className)}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      ) : (
        icon && <I name={icon} size={size === "sm" ? 14 : 16} />
      )}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  name,
  size = 17,
  className,
  ...rest
}: {
  label: string;
  name: IconName;
  size?: number;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cx(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink2 transition-all hover:bg-surface2 hover:text-ink active:scale-90 disabled:pointer-events-none disabled:opacity-40",
        className
      )}
      {...rest}
    >
      <I name={name} size={size} />
    </button>
  );
}

/* ---------------- form fields ---------------- */

export function Input({
  label,
  error,
  hint,
  className,
  id,
  ...rest
}: {
  label?: string;
  error?: string;
  hint?: string;
  className?: string;
  id?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const inputId = id ?? auto;
  const errId = error ? `${inputId}-err` : undefined;
  const field = (
    <input
      id={inputId}
      aria-invalid={error ? true : undefined}
      aria-describedby={errId}
      className={cx(
        "h-10 w-full rounded-lg border bg-surface px-3.5 text-sm text-ink placeholder:text-muted/70 transition-colors focus:outline-none focus:ring-2",
        error
          ? "border-danger/60 focus:border-danger focus:ring-danger/30"
          : "border-line focus:border-accent focus:ring-accent/40",
        className
      )}
      {...rest}
    />
  );
  if (!label) return field;
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink2">{label}</span>
      {field}
      {error && (
        <span id={errId} role="alert" className="mt-1.5 block text-[12.5px] font-medium text-danger">
          {error}
        </span>
      )}
      {hint && !error && <span className="mt-1.5 block text-[12px] leading-snug text-muted">{hint}</span>}
    </label>
  );
}

export function Select({
  label,
  className,
  id,
  children,
  ...rest
}: {
  label?: string;
  className?: string;
  id?: string;
  children: ReactNode;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const auto = useId();
  const selId = id ?? auto;
  const field = (
    <select
      id={selId}
      className={cx(
        "h-10 w-full cursor-pointer rounded-lg border border-line bg-surface px-3 text-sm text-ink transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40",
        className
      )}
      {...rest}
    >
      {children}
    </select>
  );
  if (!label) return field;
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink2">{label}</span>
      {field}
    </label>
  );
}

export function Textarea({
  label,
  className,
  id,
  ...rest
}: {
  label?: string;
  className?: string;
  id?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId();
  const taId = id ?? auto;
  const field = (
    <textarea
      id={taId}
      rows={rest.rows ?? 3}
      className={cx(
        "w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-ink placeholder:text-muted/70 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40",
        className
      )}
      {...rest}
    />
  );
  if (!label) return field;
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink2">{label}</span>
      {field}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-line"
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
            checked ? "left-[22px]" : "left-0.5"
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold text-ink">{label}</span>
        {hint && <span className="block text-[12px] leading-snug text-muted">{hint}</span>}
      </span>
    </div>
  );
}

/* ---------------- badges & cards ---------------- */

export type BadgeTone = "gray" | "accent" | "amber" | "red" | "green" | "info";

const badgeTones: Record<BadgeTone, string> = {
  gray: "bg-surface2 text-ink2",
  accent: "bg-accent/12 text-accent",
  amber: "bg-amber/15 text-amber",
  red: "bg-danger/12 text-danger",
  green: "bg-ok/12 text-ok",
  info: "bg-info/12 text-info",
};

export function Badge({ tone = "gray", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold", badgeTones[tone])}>
      {children}
    </span>
  );
}

export function statusBadge(status: DisplayStatus): { tone: BadgeTone; label: string } {
  switch (status) {
    case "draft": return { tone: "gray", label: "Draft" };
    case "sent": return { tone: "info", label: "Sent" };
    case "paid": return { tone: "green", label: "Paid" };
    case "overdue": return { tone: "red", label: "Overdue" };
    case "void": return { tone: "gray", label: "Void" };
  }
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("overflow-hidden rounded-xl border border-line bg-surface shadow-card", className)}>
      {children}
    </div>
  );
}

/* ---------------- tabs & segmented ---------------- */

export function Tabs({
  active,
  onChange,
  items,
}: {
  active: string;
  onChange: (id: string) => void;
  items: Array<{ id: string; label: string; icon?: IconName }>;
}) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1 shadow-card">
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={active === it.id}
          onClick={() => onChange(it.id)}
          className={cx(
            "inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-[13.5px] font-semibold transition-all",
            active === it.id ? "bg-accent text-onaccent shadow-sm" : "text-ink2 hover:bg-surface2 hover:text-ink"
          )}
        >
          {it.icon && <I name={it.icon} size={15} />}
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div
      className="flex max-w-full min-w-0 items-center gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-0.5"
      role="group"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-all",
            value === o.value ? "bg-accent/12 text-accent" : "text-muted hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- modal ---------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && ref.current) {
        const focusables = ref.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    const t = window.setTimeout(() => {
      const first = ref.current?.querySelector<HTMLElement>("input, select, textarea, button");
      first?.focus();
    }, 30);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        aria-label="Close dialog"
        className="absolute inset-0 bg-[#0b120e]/55 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "anim-rise relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-pop sm:rounded-2xl",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg"
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="min-w-0 truncate font-display text-[17px] font-bold text-ink">{title}</h2>
          <IconButton label="Close" name="x" size={16} onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface2/40 px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  desc,
  confirmLabel = "Delete",
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  desc: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink2">{desc}</p>
    </Modal>
  );
}

/* ---------------- menu (dropdown) ---------------- */

export interface MenuItem {
  label: string;
  icon?: IconName;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <IconButton label={label} name="dots" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu" />
      {open && (
        <div
          role="menu"
          className="anim-rise absolute right-0 top-10 z-40 w-52 rounded-xl border border-line bg-surface p-1.5 shadow-pop"
        >
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              aria-disabled={it.disabled || undefined}
              onClick={() => {
                if (it.disabled) return;
                setOpen(false);
                it.onClick();
              }}
              className={cx(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium transition-colors",
                it.disabled
                  ? "cursor-not-allowed text-muted/70"
                  : it.danger
                    ? "text-danger hover:bg-danger/10"
                    : "text-ink hover:bg-surface2"
              )}
            >
              {it.icon && <I name={it.icon} size={15} />}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- empty state / progress ---------------- */

export function EmptyState({
  icon,
  title,
  desc,
  children,
}: {
  icon: IconName;
  title: string;
  desc: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface/60 px-6 py-14 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface2 text-muted">
        <I name={icon} size={26} />
      </span>
      <h3 className="mt-4 font-display text-lg font-bold text-ink">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-muted">{desc}</p>
      {children && <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">{children}</div>}
    </div>
  );
}

export function ProgressBar({
  value,
  tone = "accent",
  label,
}: {
  value: number; // 0..1 (may exceed 1)
  tone?: "accent" | "amber" | "danger";
  label: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface2"
    >
      <div
        className={cx(
          "anim-grow h-full rounded-full transition-all",
          tone === "danger" ? "bg-danger" : tone === "amber" ? "bg-amber" : "bg-accent"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ---------------- tooltip / skeleton / pagination (blueprint S9) ---------------- */

export function Tooltip({ tip, children }: { tip: string; children: ReactNode }) {
  return (
    <span className="tv-tip inline-flex" data-tip={tip}>
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("skeleton", className)} />;
}

export function Pagination({
  page,
  pages,
  onPage,
  summary,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
  summary?: string;
}) {
  if (pages <= 1) {
    return summary ? <p className="font-mono text-[12px] text-muted">{summary}</p> : null;
  }
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" icon="chevL" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Prev
      </Button>
      <span className="font-mono text-[12.5px] font-semibold tabular text-ink2">
        {page} / {pages}
      </span>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next <I name="chevR" size={14} />
      </Button>
      {summary && <span className="ml-1 font-mono text-[12px] text-muted">{summary}</span>}
    </nav>
  );
}

/* ---------------- toasts ---------------- */

interface Toast {
  id: number;
  kind: "ok" | "info" | "err" | "amber";
  title: string;
  desc?: string;
  action?: { label: string; onClick: () => void };
}

const ToastCtx = createContext<{ push: (t: Omit<Toast, "id">) => void }>({ push: () => undefined });

export const useToast = () => useContext(ToastCtx);

let toastSeq = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = toastSeq++;
    setToasts((xs) => [...xs.slice(-3), { ...t, id }]);
    window.setTimeout(
      () => setToasts((xs) => xs.filter((x) => x.id !== id)),
      t.action ? 6500 : 4500
    );
  }, []);

  const kindIcon: Record<Toast["kind"], IconName> = { ok: "check", info: "info", err: "alert", amber: "heart" };
  const kindColor: Record<Toast["kind"], string> = {
    ok: "text-ok",
    info: "text-info",
    err: "text-danger",
    amber: "text-amber",
  };

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(92vw,360px)] flex-col gap-2.5">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="anim-toast pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-pop"
          >
            <I name={kindIcon[t.kind]} size={17} className={cx("mt-0.5 shrink-0", kindColor[t.kind])} />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-bold text-ink">{t.title}</p>
              {t.desc && <p className="mt-0.5 text-[12.5px] leading-snug text-ink2">{t.desc}</p>}
              {t.action && (
                <button
                  onClick={() => {
                    t.action?.onClick();
                    setToasts((xs) => xs.filter((x) => x.id !== t.id));
                  }}
                  className="mt-1.5 rounded-md bg-accent/10 px-2.5 py-1 text-[12.5px] font-bold text-accent transition-colors hover:bg-accent/20"
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button
              aria-label="Dismiss notification"
              onClick={() => setToasts((xs) => xs.filter((x) => x.id !== t.id))}
              className="rounded-md p-1 text-muted transition-colors hover:bg-surface2 hover:text-ink"
            >
              <I name="x" size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
