/* Platform services: feature flags (blueprint S3), exchange rates (S5),
 * and the timer chime (S4). All client-side, all optional. */

/* ---------------- feature flags ---------------- */

export const FEATURE_FLAGS = {
  plan: "free" as const,
  features: {
    sync: true,
    import: true,
    pdf: true,
    team: true,
    estimates: true,
    recurring: true,
    reports: true,
    review: true,
  },
  donation: { enabled: true, toastThreshold: 5, cooldownDays: 7 },
} as const;

export type FeatureName = keyof typeof FEATURE_FLAGS.features;
export const isEnabled = (f: FeatureName): boolean => FEATURE_FLAGS.features[f];

/* ---------------- exchange rates (open.er-api.com, 24h cache) ----------------
 * Fetched ONLY when a currency-aware view is opened — never on app load.
 * Falls back to the last cache, then to 1:1 with a flag. */

export interface RatesInfo {
  base: string;
  rates: Record<string, number>;
  fetchedAt: number;
}

const LS_KEY = "tk-rates";
const TTL_MS = 24 * 60 * 60 * 1000;

export function readRatesCache(): RatesInfo | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RatesInfo;
    if (!parsed || typeof parsed.fetchedAt !== "number" || !parsed.rates) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function fetchRates(): Promise<RatesInfo> {
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!res.ok) throw new Error(`Rate API status ${res.status}`);
  const json = (await res.json()) as { rates?: Record<string, number> };
  if (!json.rates) throw new Error("Malformed rate response");
  const info: RatesInfo = { base: "USD", rates: json.rates, fetchedAt: Date.now() };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(info));
  } catch {
    /* private mode — in-memory still works */
  }
  return info;
}

export function makeConverter(
  info: RatesInfo | null,
  reportCurrency: string
): (cur: string) => number {
  return (cur: string) => {
    if (!info || cur === reportCurrency) return 1;
    const from = info.rates[cur];
    const to = info.rates[reportCurrency] ?? 1;
    if (!from) return 1; // unknown currency — never produce garbage
    return to / from;
  };
}

/* ---------------- timer chime (WebAudio, no assets) ---------------- */

let audioCtx: AudioContext | null = null;

function tone(freq: number, start: number, dur: number, gain: number): void {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, audioCtx.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, audioCtx.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + start + dur);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(audioCtx.currentTime + start);
  osc.stop(audioCtx.currentTime + start + dur + 0.05);
}

/** Short two-note chime. kind=start rises, kind=stop settles. */
export function chime(kind: "start" | "stop"): void {
  try {
    audioCtx = audioCtx ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    if (kind === "start") {
      tone(660, 0, 0.14, 0.08);
      tone(880, 0.13, 0.18, 0.08);
    } else {
      tone(880, 0, 0.12, 0.08);
      tone(587, 0.11, 0.2, 0.08);
    }
  } catch {
    /* audio unavailable — silent by design */
  }
}
