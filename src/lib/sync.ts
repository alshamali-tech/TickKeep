/* Cross-device sync: moves one file (tickkeep-backup.json) between this
 * browser and storage the user already controls — a local/Drive/OneDrive
 * folder via the File System Access API, or the user's own server via WebDAV.
 * Pulls never overwrite local data silently (callers compare timestamps). */
import { useStore } from "./store";

export type FolderProvider = "device" | "gdrive" | "onedrive";

export const BACKUP_FILE = "tickkeep-backup.json";

export const fsSupported = (): boolean =>
  typeof window !== "undefined" && "showDirectoryPicker" in window;

export const nowIso = (): string => new Date().toISOString();

export class SyncError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/* ---------- IndexedDB store for the persisted directory handle ---------- */

const DB_NAME = "tickkeep-sync-handles";
const STORE = "handles";
const HANDLE_KEY = "dir";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbDel(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- folder adapter ---------- */

type DirHandle = FileSystemDirectoryHandle;
type AnyHandle = DirHandle & {
  queryPermission?: (d: { mode: string }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: string }) => Promise<PermissionState>;
};

let dirHandle: DirHandle | null = null;

export const hasFolderHandle = (): boolean => dirHandle !== null;

async function queryPerm(): Promise<PermissionState> {
  try {
    const h = dirHandle as AnyHandle | null;
    if (!h?.queryPermission) return "granted";
    return await h.queryPermission({ mode: "readwrite" });
  } catch {
    return "prompt";
  }
}

export async function restoreFolderHandle(): Promise<"granted" | "prompt" | null> {
  if (dirHandle) return (await queryPerm()) === "granted" ? "granted" : "prompt";
  try {
    const h = await idbGet<DirHandle>(HANDLE_KEY);
    if (!h) return null;
    dirHandle = h;
    return (await queryPerm()) === "granted" ? "granted" : "prompt";
  } catch {
    return null;
  }
}

async function ensurePerm(interactive: boolean): Promise<boolean> {
  if (!dirHandle) return false;
  if ((await queryPerm()) === "granted") return true;
  if (!interactive) return false;
  try {
    const h = dirHandle as AnyHandle;
    if (!h.requestPermission) return true;
    return (await h.requestPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

const PERMISSION_MSG =
  "Folder access needs (re-)approval. Press the button once more and allow access in the browser prompt.";

export async function chooseFolder(): Promise<string> {
  const picker = (window as unknown as {
    showDirectoryPicker: (opts?: { mode: string; id?: string }) => Promise<DirHandle>;
  }).showDirectoryPicker;
  const h = await picker({ mode: "readwrite", id: "tickkeep" });
  dirHandle = h;
  try {
    await idbSet(HANDLE_KEY, h);
  } catch {
    /* best-effort; in-memory still works for this session */
  }
  return h.name;
}

export async function folderDisconnect(): Promise<void> {
  dirHandle = null;
  try {
    await idbDel(HANDLE_KEY);
  } catch {
    /* ignore */
  }
}

export async function folderPush(interactive: boolean): Promise<void> {
  if (!dirHandle) throw new SyncError("no-folder", "No folder is connected yet.");
  if (!(await ensurePerm(interactive))) throw new SyncError("permission", PERMISSION_MSG);
  const json = useStore.getState().exportData();
  const fh = await dirHandle.getFileHandle(BACKUP_FILE, { create: true });
  const writable = await (fh as unknown as { createWritable: () => Promise<FileSystemWritableFileStream> }).createWritable();
  await writable.write(json);
  await writable.close();
}

export interface RemoteFile {
  text: string;
  modified: number;
}

export async function folderRead(interactive: boolean): Promise<RemoteFile | null> {
  if (!dirHandle) throw new SyncError("no-folder", "No folder is connected yet.");
  if (!(await ensurePerm(interactive))) throw new SyncError("permission", PERMISSION_MSG);
  try {
    const fh = await dirHandle.getFileHandle(BACKUP_FILE);
    const file = await fh.getFile();
    return { text: await file.text(), modified: file.lastModified };
  } catch (err) {
    if ((err as DOMException)?.name === "NotFoundError") return null;
    throw err;
  }
}

/* ---------- shared pull helpers ---------- */

export function remoteSnapshotAt(parsed: unknown, fallbackModified: number): string {
  const e = (parsed as { exportedAt?: unknown })?.exportedAt;
  if (typeof e === "string" && !Number.isNaN(Date.parse(e))) return e;
  return new Date(fallbackModified).toISOString();
}

export function parseSnapshot(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new SyncError("parse", "That backup file isn't valid JSON — it may be half-written. Try again in a moment.");
  }
}

/* ---------- programmatic push for the auto-sync scheduler ---------- */

export async function autoPush(kind: "folder"): Promise<boolean> {
  const s = useStore.getState();
  try {
    if (kind === "folder") {
      const meta = s.syncMeta.folder;
      if (!meta || !hasFolderHandle()) return false;
      await folderPush(false);
      s.setFolderMeta({ ...meta, lastSyncAt: nowIso(), lastRemoteAt: nowIso() });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
