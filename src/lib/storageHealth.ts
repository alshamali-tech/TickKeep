/* Storage Health Monitor (ADR-004) — defense in depth against browser eviction.
 *
 * Browsers treat client storage as best-effort: Safari may purge after 7 idle
 * days, Chrome evicts under disk pressure. We can't prevent eviction, so we
 * (1) ask for persistent status, (2) measure quota pressure, (3) warn the user
 * before it bites, and (4) keep recovery options one click away. */

export interface StorageReport {
  persistent: boolean | null; // null = API unavailable
  quotaMB: number | null;
  usageMB: number | null;
  usagePct: number | null;
  ledgerKB: number;
  receiptKB: number;
  lastBackupAt: string | null;
  daysSinceBackup: number | null;
  risk: "low" | "medium" | "high";
  reason: string;
}

const BACKUP_KEY = "tk-last-backup";

/** Call once at boot. Best-effort — never throws. */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

async function estimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}

function ledgerBytes(): number {
  try {
    const raw = localStorage.getItem("tickkeep-v1");
    return raw ? raw.length * 2 : 0; // UTF-16
  } catch {
    return 0;
  }
}

export function stampBackup(): void {
  try {
    localStorage.setItem(BACKUP_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

export function lastBackupAt(): string | null {
  try {
    return localStorage.getItem(BACKUP_KEY);
  } catch {
    return null;
  }
}

/** Full diagnostic, safe to call on every boot. */
export async function storageReport(): Promise<StorageReport> {
  const persistent = await requestPersistence();
  const est = await estimate();
  const quotaMB = est && est.quota > 0 ? est.quota / 1048576 : null;
  const usageMB = est ? est.usage / 1048576 : null;
  const usagePct = quotaMB && usageMB !== null ? (usageMB / quotaMB) * 100 : null;

  const raw = (() => {
    try {
      return localStorage.getItem("tickkeep-v1") ?? "";
    } catch {
      return "";
    }
  })();
  const ledgerKB = Math.round((raw.length * 2) / 1024);
  const receiptKB = Math.round(
    (raw.match(/data:image\/[a-z]+;base64,[^"]*/g) ?? []).reduce((n, m) => n + m.length, 0) / 1024
  );

  const last = lastBackupAt();
  const daysSinceBackup = last
    ? Math.floor((Date.now() - Date.parse(last)) / 86400000)
    : null;

  /* Risk model: eviction likelihood × exposure (unbacked-up data). */
  let risk: StorageReport["risk"] = "low";
  let reason = "Storage looks healthy.";
  const exposed = daysSinceBackup === null || daysSinceBackup > 3;

  if (persistent === false) {
    risk = exposed ? "high" : "medium";
    reason =
      "This browser can clear TickKeep's data after a few idle days (Safari does this after ~7). A recent backup is your safety net.";
  } else if (usagePct !== null && usagePct > 80) {
    risk = "high";
    reason = `Browser storage is ${usagePct.toFixed(0)}% full — eviction pressure is high. Export or trim old receipts.`;
  } else if (quotaMB !== null && quotaMB < 100) {
    risk = exposed ? "high" : "medium";
    reason = "This browser offers a small storage quota. Keep a backup handy.";
  } else if (daysSinceBackup !== null && daysSinceBackup > 7) {
    risk = "medium";
    reason = `No backup in ${daysSinceBackup} days. One click keeps you safe.`;
  } else if (daysSinceBackup === null && ledgerKB > 50) {
    risk = "medium";
    reason = "You have real data here but no backup on record yet.";
  }

  return {
    persistent,
    quotaMB,
    usageMB,
    usagePct,
    ledgerKB,
    receiptKB,
    lastBackupAt: last,
    daysSinceBackup,
    risk,
    reason,
  };
}
