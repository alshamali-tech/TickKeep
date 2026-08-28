import { useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";
import {
  BACKUP_FILE, SyncError, chooseFolder, folderDisconnect, folderPush, folderRead,
  fsSupported, hasFolderHandle, nowIso, parseSnapshot, remoteSnapshotAt, restoreFolderHandle,
  validDavUrl, webdavPush, webdavRead, webdavTest,
} from "../lib/sync";
import { I } from "../components/icons";
import { Badge, Button, Card, ConfirmDialog, Input, Select, Toggle, useToast } from "../components/ui";
import { fmtDate, fmtHL } from "../lib/utils";

const fmtWhen = (iso: string | null) => (iso ? `${fmtDate(iso.slice(0, 10))} ${iso.slice(11, 16)}` : "never");
const errMsg = (e: unknown) => (e instanceof SyncError ? e.message : "Sync failed — check the connection and try again.");

export function SyncPage() {
  const syncMeta = useStore((s) => s.syncMeta);
  const setFolderMeta = useStore((s) => s.setFolderMeta);
  const setWebDavMeta = useStore((s) => s.setWebDavMeta);
  const setAutoSync = useStore((s) => s.setAutoSync);
  const importData = useStore((s) => s.importData);
  const { push } = useToast();

  const [folderPerm, setFolderPerm] = useState<"granted" | "prompt" | null>(null);
  const [pullConfirm, setPullConfirm] = useState<{ parsed: unknown; at: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // WebDAV form
  const [url, setUrl] = useState(syncMeta.webdav?.url ?? "");
  const [username, setUsername] = useState(syncMeta.webdav?.username ?? "");
  const [password, setPassword] = useState(syncMeta.webdav?.password ?? "");
  const [urlErr, setUrlErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (fsSupported()) {
      restoreFolderHandle().then((p) => {
        if (!cancelled) setFolderPerm(p);
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  /* auto-backup scheduler — runs while this page (and the app) is open */
  const autoRef = useRef(syncMeta.auto);
  autoRef.current = syncMeta.auto;
  useEffect(() => {
    const id = window.setInterval(async () => {
      const a = autoRef.current;
      if (!a.enabled) return;
      const meta = useStore.getState().syncMeta;
      try {
        if (meta.active === "folder" && hasFolderHandle()) {
          await folderPush(false);
          setFolderMeta({ ...(meta.folder as NonNullable<typeof meta.folder>), lastSyncAt: nowIso(), lastRemoteAt: nowIso() });
        } else if (meta.active === "webdav" && meta.webdav) {
          await webdavPush(meta.webdav);
          setWebDavMeta({ ...meta.webdav, lastSyncAt: nowIso(), lastRemoteAt: nowIso() });
        }
      } catch {
        /* silent — next tick retries */
      }
    }, 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doFolderPush = async () => {
    setBusy("push");
    try {
      await folderPush(true);
      const meta = useStore.getState().syncMeta.folder;
      if (meta) setFolderMeta({ ...meta, lastSyncAt: nowIso(), lastRemoteAt: nowIso() });
      setFolderPerm("granted");
      push({ kind: "ok", title: "Backup pushed", desc: `${BACKUP_FILE} updated in your folder.` });
    } catch (e) {
      push({ kind: "err", title: "Push failed", desc: errMsg(e) });
    } finally {
      setBusy(null);
    }
  };

  const doFolderPull = async () => {
    setBusy("pull");
    try {
      const file = await folderRead(true);
      setFolderPerm("granted");
      if (!file) {
        push({ kind: "info", title: "No backup file yet", desc: "Push once to create it in the folder." });
        return;
      }
      const parsed = parseSnapshot(file.text);
      const at = remoteSnapshotAt(parsed, file.modified);
      const meta = useStore.getState().syncMeta.folder;
      if (meta?.lastSyncAt && at <= meta.lastSyncAt) {
        push({ kind: "info", title: "Already up to date", desc: "The folder backup isn't newer than this device." });
        return;
      }
      setPullConfirm({ parsed, at });
    } catch (e) {
      push({ kind: "err", title: "Pull failed", desc: errMsg(e) });
    } finally {
      setBusy(null);
    }
  };

  const connectFolder = async () => {
    try {
      const name = await chooseFolder();
      setFolderMeta({ provider: "device", dirName: name, lastSyncAt: null, lastRemoteAt: null });
      setFolderPerm("granted");
      push({ kind: "ok", title: `Connected to “${name}”`, desc: "Works with Google Drive, OneDrive or any local folder." });
    } catch {
      /* user cancelled the picker */
    }
  };

  const disconnectFolder = async () => {
    await folderDisconnect();
    setFolderMeta(null);
    setFolderPerm(null);
    push({ kind: "info", title: "Folder disconnected" });
  };

  const connectDav = async () => {
    if (!validDavUrl(url)) {
      setUrlErr("Enter a full URL, e.g. https://cloud.example.com/dav/timevault-backup.json");
      return;
    }
    setBusy("davtest");
    try {
      const res = await webdavTest({ url: url.trim(), username: username.trim(), password });
      setWebDavMeta({ url: url.trim(), username: username.trim(), password, lastSyncAt: null, lastRemoteAt: null });
      push({
        kind: "ok",
        title: "Server connected",
        desc: res === "empty" ? "Reachable — no backup file there yet." : "Reachable — found an existing backup.",
      });
    } catch (e) {
      push({ kind: "err", title: "Couldn't reach the server", desc: errMsg(e) });
    } finally {
      setBusy(null);
    }
  };

  const doDavPush = async () => {
    const cfg = useStore.getState().syncMeta.webdav;
    if (!cfg) return;
    setBusy("davpush");
    try {
      await webdavPush(cfg);
      setWebDavMeta({ ...cfg, lastSyncAt: nowIso(), lastRemoteAt: nowIso() });
      push({ kind: "ok", title: "Backup uploaded to server" });
    } catch (e) {
      push({ kind: "err", title: "Upload failed", desc: errMsg(e) });
    } finally {
      setBusy(null);
    }
  };

  const doDavPull = async () => {
    const cfg = useStore.getState().syncMeta.webdav;
    if (!cfg) return;
    setBusy("davpull");
    try {
      const file = await webdavRead(cfg);
      if (!file) {
        push({ kind: "info", title: "No backup on the server yet" });
        return;
      }
      const parsed = parseSnapshot(file.text);
      const at = remoteSnapshotAt(parsed, file.modified);
      const meta = useStore.getState().syncMeta.webdav;
      if (meta?.lastSyncAt && at <= meta.lastSyncAt) {
        push({ kind: "info", title: "Already up to date" });
        return;
      }
      setPullConfirm({ parsed, at });
    } catch (e) {
      push({ kind: "err", title: "Download failed", desc: errMsg(e) });
    } finally {
      setBusy(null);
    }
  };

  const folder = syncMeta.folder;
  const dav = syncMeta.webdav;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <p className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-4 py-3.5 text-[13px] leading-relaxed text-ink2 shadow-card">
        <I name="shield" size={16} className="mt-0.5 shrink-0 text-accent" />
        <span>
          Sync moves one file — <code className="rounded bg-surface2 px-1 font-mono text-[12px]">{BACKUP_FILE}</code> — between this
          browser and storage <strong className="text-ink">you</strong> control. No TimeVault server is ever involved.
          Pulling never overwrites your data without asking.
        </span>
      </p>

      {/* -------- folder sync -------- */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">Folder sync</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              A folder on this PC — or your Google Drive / OneDrive desktop-sync folder.
            </p>
          </div>
          {folder ? (
            <Badge tone="green">connected{syncMeta.active === "folder" ? " · active" : ""}</Badge>
          ) : (
            <Badge tone="gray">not connected</Badge>
          )}
        </div>

        {!fsSupported() ? (
          <p className="mt-4 rounded-lg bg-surface2/60 px-4 py-3 text-[13px] text-ink2">
            This browser doesn't expose folder access (try Chrome or Edge on desktop). The server option below works everywhere.
          </p>
        ) : !folder ? (
          <Button className="mt-4" icon="box" onClick={connectFolder}>
            Choose a sync folder
          </Button>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-surface2/50 px-4 py-3 font-mono text-[12.5px] text-ink2">
              <span className="flex items-center gap-2 text-ink">
                <I name="box" size={15} className="text-accent" /> {folder.dirName}
              </span>
              <span>last push: {fmtWhen(folder.lastSyncAt)}</span>
              {folderPerm === "prompt" && <span className="text-amber">folder access needs re-approval</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon="upload" onClick={doFolderPush} disabled={busy !== null}>
                {busy === "push" ? "Pushing…" : "Push now"}
              </Button>
              <Button size="sm" variant="outline" icon="download" onClick={doFolderPull} disabled={busy !== null}>
                {busy === "pull" ? "Pulling…" : "Pull"}
              </Button>
              <Button size="sm" variant="ghost" icon="x" onClick={disconnectFolder}>
                Disconnect
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* -------- server (WebDAV) -------- */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">Your own server</h2>
            <p className="mt-0.5 text-[13px] text-muted">Any WebDAV endpoint — Nextcloud, ownCloud, a NAS, or rclone serve.</p>
          </div>
          {dav ? (
            <Badge tone="green">connected{syncMeta.active === "webdav" ? " · active" : ""}</Badge>
          ) : (
            <Badge tone="gray">not connected</Badge>
          )}
        </div>

        {!dav ? (
          <div className="mt-4 space-y-3">
            <Input
              label="Backup file URL"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setUrlErr("");
              }}
              placeholder="https://cloud.example.com/dav/timevault-backup.json"
              error={urlErr || undefined}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Username (optional)" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
              <Input label="Password (optional)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </div>
            <Button icon="sync" onClick={connectDav} disabled={busy !== null}>
              {busy === "davtest" ? "Testing…" : "Connect & test"}
            </Button>
            <p className="text-[12px] leading-snug text-muted">
              Credentials never leave this device. The server must allow CORS from where TimeVault runs, or use a local/NAS endpoint.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-surface2/50 px-4 py-3 font-mono text-[12.5px] text-ink2">
              <span className="flex min-w-0 items-center gap-2 text-ink">
                <I name="sync" size={15} className="text-accent" />
                <span className="max-w-72 truncate">{dav.url}</span>
              </span>
              <span>last push: {fmtWhen(dav.lastSyncAt)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon="upload" onClick={doDavPush} disabled={busy !== null}>
                {busy === "davpush" ? "Uploading…" : "Push now"}
              </Button>
              <Button size="sm" variant="outline" icon="download" onClick={doDavPull} disabled={busy !== null}>
                {busy === "davpull" ? "Downloading…" : "Pull"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon="x"
                onClick={() => {
                  setWebDavMeta(null);
                  push({ kind: "info", title: "Server disconnected" });
                }}
              >
                Disconnect
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* -------- auto backup -------- */}
      <Card className="p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-ink">Auto-backup</h2>
        <p className="mt-0.5 text-[13px] text-muted">Push to the active destination on a schedule — only while the app is open.</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Toggle
            checked={syncMeta.auto.enabled}
            onChange={(v) => {
              setAutoSync({ enabled: v });
              push({ kind: "info", title: v ? "Auto-backup on" : "Auto-backup off" });
            }}
            label="Enable auto-backup"
          />
          <div className="w-44">
            <Select
              value={String(syncMeta.auto.intervalMin)}
              onChange={(e) => setAutoSync({ intervalMin: Number(e.target.value) })}
              aria-label="Auto-backup interval"
            >
              <option value="5">Every 5 minutes</option>
              <option value="15">Every 15 minutes</option>
              <option value="30">Every 30 minutes</option>
              <option value="60">Every hour</option>
            </Select>
          </div>
          <span className="font-mono text-[12.5px] text-muted">
            destination: {syncMeta.active === "folder" ? folder?.dirName ?? "folder" : syncMeta.active === "webdav" ? "server" : "none — connect one above"}
          </span>
        </div>
      </Card>

      <p className="flex items-center gap-2 font-mono text-[12px] text-muted">
        <I name="info" size={13} /> Conflict rule: if the remote backup is newer, TimeVault asks before replacing anything.
      </p>

      <ConfirmDialog
        open={pullConfirm !== null}
        onClose={() => setPullConfirm(null)}
        title="Remote backup is newer"
        desc={`The backup is from ${pullConfirm ? fmtWhen(pullConfirm.at) : ""}. Replace this device's ledger with it? This can't be undone.`}
        confirmLabel="Replace local data"
        onConfirm={() => {
          if (!pullConfirm) return;
          const err = importData(pullConfirm.parsed);
          if (err) push({ kind: "err", title: "Import failed", desc: err });
          else {
            push({ kind: "ok", title: "Ledger replaced from backup" });
            const meta = useStore.getState().syncMeta;
            if (meta.active === "folder" && meta.folder) setFolderMeta({ ...meta.folder, lastSyncAt: nowIso() });
            if (meta.active === "webdav" && meta.webdav) setWebDavMeta({ ...meta.webdav, lastSyncAt: nowIso() });
          }
          setPullConfirm(null);
        }}
      />

      <span className="sr-only">{fmtHL(0)}</span>
    </div>
  );
}
