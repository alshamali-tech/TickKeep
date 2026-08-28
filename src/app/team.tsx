import { useState } from "react";
import { PEER_COLORS, useStore } from "../lib/store";
import { computeMerge, validateSharedFile, type CollabError } from "../lib/collab";
import { folderPush, folderRead, hasFolderHandle, nowIso, parseSnapshot } from "../lib/sync";
import { I } from "../components/icons";
import { Badge, Button, Card, Input, Toggle, useNow, useToast, navigate } from "../components/ui";
import { cx } from "../lib/utils";

function rel(at: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(at)) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function TeamPage() {
  const collab = useStore((s) => s.collab);
  const setCollab = useStore((s) => s.setCollab);
  const applyCollabMerge = useStore((s) => s.applyCollabMerge);
  const syncActive = useStore((s) => s.syncMeta.active);
  const { push } = useToast();
  const now = useNow(collab.enabled ? 1000 : 0);
  const [busy, setBusy] = useState<"push" | "pull" | "sync" | null>(null);

  const peers = collab.peers.filter((p) => Date.now() - Date.parse(p.at) < 5 * 60_000);
  const lastMerge = collab.lastMerge;

  const doSync = async (mode: "sync" | "push" | "pull") => {
    if (!hasFolderHandle()) {
      push({ kind: "err", title: "Connect a shared folder first", desc: "Sync page → Folder sync → choose your team's Drive/OneDrive folder." });
      return;
    }
    setBusy(mode);
    try {
      if (mode !== "pull") {
        await folderPush(true);
        if (mode === "push") {
          push({ kind: "ok", title: "Your ledger is shared", desc: "Teammates will pick it up on their next sync." });
          return;
        }
      }
      const file = await folderRead(true);
      if (!file) {
        push({ kind: "info", title: "No shared ledger yet", desc: "You're the first one here — push created the file." });
        return;
      }
      const parsed = validateSharedFile(parseSnapshot(file.text));
      const result = computeMerge(parsed, nowIso());
      applyCollabMerge(result);
      if (mode === "sync") await folderPush(false);
      const { added, updated, removed } = result.stats;
      push({
        kind: "ok",
        title: `Merged — ${peersAfter(result.peers.length)} on the team`,
        desc: `+${added} new · ~${updated} updated · −${removed} removed`,
      });
    } catch (e) {
      const msg = (e as CollabError).message ?? "Sync failed.";
      push({ kind: "err", title: "Team sync failed", desc: msg });
    } finally {
      setBusy(null);
    }
  };

  const peersAfter = (n: number) => `${n} ${n === 1 ? "peer" : "peers"}`;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="relative overflow-hidden rounded-xl border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="glow-amber pointer-events-none absolute -right-16 -top-20 h-56 w-56" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-extrabold text-ink">
              {collab.enabled ? collab.teamName || "Your team" : "Work together"}
            </h2>
            <p className="mt-1 max-w-md text-[13.5px] leading-relaxed text-ink2">
              Team mode merges everyone's ledger through one shared file in your team's Drive, OneDrive or server folder.
              Adds union, edits keep the latest, deletions propagate — nobody's work is clobbered.
            </p>
          </div>
          <Toggle
            checked={collab.enabled}
            onChange={(v) => {
              setCollab({ enabled: v });
              push({ kind: "info", title: v ? "Team mode on" : "Team mode off" });
            }}
            label="Enable team mode"
          />
        </div>
      </div>

      {collab.enabled && (
        <>
          <Card className="p-5 sm:p-6">
            <h3 className="font-display text-[15px] font-bold text-ink">You, in the merge</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input label="Display name" value={collab.peerName} onChange={(e) => setCollab({ peerName: e.target.value })} />
              <Input label="Team name" value={collab.teamName} onChange={(e) => setCollab({ teamName: e.target.value })} />
            </div>
            <p className="mb-1.5 mt-4 text-[12.5px] font-semibold text-ink2">Your color</p>
            <div className="flex flex-wrap gap-2">
              {PEER_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCollab({ peerColor: c })}
                  aria-label={`Peer color ${c}`}
                  className={cx("h-8 w-8 rounded-full transition-transform hover:scale-110 active:scale-95", collab.peerColor === c && "ring-2 ring-ink ring-offset-2 ring-offset-surface")}
                  style={{ background: c }}
                />
              ))}
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-[15px] font-bold text-ink">Right now</h3>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  {peers.length === 0 ? "No peers seen in the last 5 minutes" : `${peers.length} ${peers.length === 1 ? "person" : "people"} active`}
                  {" · "}last merge {collab.lastMergeAt ? rel(collab.lastMergeAt, now) : "never"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" icon="upload" onClick={() => doSync("push")} disabled={busy !== null}>
                  {busy === "push" ? "Sharing…" : "Share mine"}
                </Button>
                <Button size="sm" icon="sync" onClick={() => doSync("sync")} disabled={busy !== null}>
                  {busy === "sync" ? "Merging…" : "Sync now"}
                </Button>
              </div>
            </div>

            {/* avatar stack */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="relative">
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-full font-display text-[15px] font-extrabold text-white"
                  style={{ background: collab.peerColor }}
                >
                  {(collab.peerName || "Me").slice(0, 1).toUpperCase()}
                </span>
                <span className="pulse-dot absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-surface bg-ok" />
              </span>
              {peers
                .filter((p) => p.id !== collab.peerId)
                .map((p) => (
                  <span key={p.id} className="relative" title={`${p.name} · seen ${rel(p.at, now)}`}>
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-full font-display text-[15px] font-extrabold text-white"
                      style={{ background: p.color }}
                    >
                      {p.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="pulse-dot absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-surface bg-ok" />
                  </span>
                ))}
              <span className="ml-1 font-mono text-[12px] text-muted">
                {syncActive ? "sharing through the connected destination" : "connect a folder on the Sync page to merge"}
              </span>
            </div>

            {lastMerge && (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                <Badge tone="green">+{lastMerge.added} added</Badge>
                <Badge tone="info">~{lastMerge.updated} updated</Badge>
                <Badge tone="gray">−{lastMerge.removed} removed</Badge>
                <span className="ml-auto font-mono text-[11.5px] text-muted">merge is idempotent & order-independent</span>
              </div>
            )}
          </Card>

          <Card className="p-5 sm:p-6">
            <h3 className="font-display text-[15px] font-bold text-ink">How the merge protects everyone</h3>
            <ul className="mt-4 space-y-3">
              {[
                ["plus", "New entries, clients and invoices from any device are unioned — nothing is ever dropped."],
                ["pencil", "Concurrent edits resolve to the latest write; equal timestamps break ties deterministically, so all devices converge."],
                ["shield", "Deletes travel as tombstones — an old snapshot can't resurrect work someone already removed."],
                ["invoice", "Invoice numbering takes the maximum, so two people can never issue the same number."],
              ].map(([icon, text]) => (
                <li key={text} className="flex items-start gap-3 text-[13.5px] leading-relaxed text-ink2">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <I name={icon as "plus"} size={14} />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
            {!syncActive && (
              <Button className="mt-4" variant="soft" icon="sync" onClick={() => navigate("#/app/sync")}>
                Connect the shared folder
              </Button>
            )}
          </Card>
        </>
      )}

      {!collab.enabled && (
        <Card className="p-5 sm:p-6">
          <h3 className="font-display text-[15px] font-bold text-ink">Three steps to a shared ledger</h3>
          <ol className="mt-4 space-y-4">
            {[
              ["box", "Pick one folder everyone can reach — a Google Drive or OneDrive sync folder, a NAS share, or a WebDAV server."],
              ["sync", "Each person enables team mode and hits “Sync now” whenever they want the latest picture."],
              ["check", "The merge does the rest: everyone's hours, invoices and clients land in one consistent ledger."],
            ].map(([icon, text], i) => (
              <li key={text} className="flex items-start gap-3.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent font-display text-[14px] font-extrabold text-onaccent">
                  {i + 1}
                </span>
                <p className="pt-1 text-[13.5px] leading-relaxed text-ink2">
                  <I name={icon as "box"} size={14} className="mr-1.5 inline text-accent" />
                  {text}
                </p>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
