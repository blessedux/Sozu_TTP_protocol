import { sendJson } from "./json-channel";

/** Median round-trip time over DataChannel ping/pong (receiver must echo `pong` with same `id`). */
export async function measureMedianRttMs(
  dc: RTCDataChannel,
  opts: { pings: number; timeoutMs: number }
): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < opts.pings; i++) {
    const id = crypto.randomUUID();
    const t0 = performance.now();
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        dc.removeEventListener("message", onMsg);
        reject(new Error("pong timeout"));
      }, opts.timeoutMs);

      function onMsg(ev: MessageEvent) {
        try {
          const m = JSON.parse(String(ev.data)) as { t?: string; id?: string };
          if (m.t === "pong" && m.id === id) {
            window.clearTimeout(timer);
            dc.removeEventListener("message", onMsg);
            resolve();
          }
        } catch {
          /* ignore */
        }
      }

      dc.addEventListener("message", onMsg);
      sendJson(dc, { t: "ping", id, ts: t0 });
    });
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)]!;
}
