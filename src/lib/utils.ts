/* Pure helpers — no React, no DOM dependencies (except downloadFile). */

export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(" ");

export function uid(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return "id-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export const pad2 = (n: number): string => String(n).padStart(2, "0");

export const toKey = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const todayKey = (): string => toKey(new Date());

export const parseKey = (k: string): Date => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

export const addDays = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** Whole days from date-string `a` to date-string `b` (both YYYY-MM-DD). */
export const daysBetween = (a: string, b: string): number => {
  const ms = parseKey(b).getTime() - parseKey(a).getTime();
  return Math.max(0, Math.round(ms / 86400000));
};

/** Timesheet lock check: is an entry dated `dateKey` frozen (read-only)? */
export const isDateLocked = (dateKey: string, lockBeforeDate: string | null): boolean =>
  Boolean(lockBeforeDate) && dateKey < (lockBeforeDate as string);

export const fmtDay = (k: string): string =>
  parseKey(k).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export const fmtDate = (k: string): string =>
  parseKey(k).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export const fmtDayLong = (d: Date): string =>
  d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

export const relDay = (k: string): string => {
  if (k === todayKey()) return "Today";
  if (k === toKey(addDays(new Date(), -1))) return "Yesterday";
  return fmtDay(k);
};

export function startOfWeek(d: Date, weekStart: 0 | 1): Date {
  const x = new Date(d);
  const diff = (x.getDay() - weekStart + 7) % 7;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function lastNDays(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) out.push(toKey(addDays(now, -i)));
  return out;
}

export function rangeKeys(a: Date, b: Date): string[] {
  const out: string[] = [];
  const x = new Date(a);
  x.setHours(0, 0, 0, 0);
  const end = new Date(b);
  end.setHours(0, 0, 0, 0);
  while (x <= end) {
    out.push(toKey(x));
    x.setDate(x.getDate() + 1);
  }
  return out;
}

/** "85" -> "1:25" */
export const fmtH = (min: number): string => {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}:${pad2(m % 60)}`;
};

/** "85" -> "1h 25m" */
export const fmtHL = (min: number): string => {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r ? `${h}h ${pad2(r)}m` : `${h}h`;
};

export const decH = (min: number): number => Math.round((min / 60) * 100) / 100;

/** Accepts "1:30", "90", "90m", "1.5h", "1h 30m". Bare integer = minutes, bare decimal = hours. */
export function parseDurationInput(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  if (s.includes(":")) {
    const [h, m] = s.split(":").map((v) => parseFloat(v));
    if (Number.isNaN(h)) return null;
    return Math.round(h * 60 + (Number.isNaN(m) ? 0 : m));
  }
  const hm = s.match(/^(\d+)\s*h(?:\s*(\d+)\s*m?)?$/);
  if (hm) return parseInt(hm[1], 10) * 60 + (hm[2] ? parseInt(hm[2], 10) : 0);
  const mm = s.match(/^(\d+)\s*m$/);
  if (mm) return parseInt(mm[1], 10);
  const f = parseFloat(s);
  if (Number.isNaN(f) || f <= 0) return null;
  if (s.endsWith("h")) return Math.round(f * 60);
  return Number.isInteger(f) ? f : Math.round(f * 60);
}

export const CURRENCIES = [
  "USD", "EUR", "GBP", "CAD", "AUD", "CHF", "SEK", "NOK", "DKK", "JPY",
  "INR", "SGD", "NZD", "AED", "ZAR", "BRL", "MXN", "TRY", "KRW", "CNY", "PLN", "CZK",
] as const;

export function money(amount: number, code: string = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export const hoursAmount = (min: number, rate: number): number => round2((min / 60) * rate);

export function downloadFile(name: string, content: string, type = "text/plain"): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const csvCell = (v: string | number | boolean): string => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCSV = (rows: Array<Array<string | number | boolean>>): string =>
  rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

export const clamp = (n: number, a: number, b: number): number => Math.min(b, Math.max(a, n));

export const bytesLabel = (b: number): string =>
  b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let id: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (id) clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
}

export function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let last = 0;
  return (...args: A) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  };
}
