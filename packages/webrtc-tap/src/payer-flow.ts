import { io, type Socket } from "socket.io-client";
import { DEFAULT_ICE_SERVERS } from "./default-ice";
import { sendJson } from "./json-channel";
import { measureMedianRttMs } from "./rtt";

export const DEFAULT_MAX_MEDIAN_RTT_MS = 150;

export type PayerTapExchangeResult = {
  payload: string;
  sendTxHash: (hash: string) => void;
  close: () => void;
};

/**
 * Payer taps a live request: signaling + WebRTC offer + DataChannel RTT gate + receive payload string.
 */
export async function payerTapExchange(opts: {
  signalingUrl: string;
  requestId: string;
  maxMedianRttMs?: number;
  pingCount?: number;
  iceServers?: RTCIceServer[];
  onStatus?: (s: string) => void;
}): Promise<PayerTapExchangeResult> {
  const {
    signalingUrl,
    requestId,
    maxMedianRttMs = DEFAULT_MAX_MEDIAN_RTT_MS,
    pingCount = 5,
    iceServers = DEFAULT_ICE_SERVERS,
    onStatus = () => {}
  } = opts;

  const socket: Socket = io(signalingUrl, {
    transports: ["websocket", "polling"],
    autoConnect: true
  });

  await new Promise<void>((resolve, reject) => {
    if (socket.connected) resolve();
    else {
      socket.once("connect", () => resolve());
      socket.once("connect_error", (err) => reject(err));
    }
  });

  const tapAck = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
    socket.emit("payer:tap", { requestId }, (r: { ok: boolean; error?: string }) => resolve(r));
  });
  if (!tapAck.ok) {
    socket.close();
    throw new Error(tapAck.error ?? "payer:tap failed");
  }
  onStatus("Tap accepted — WebRTC starting…");

  const pc = new RTCPeerConnection({ iceServers });
  const pendingRemoteIce: RTCIceCandidateInit[] = [];
  let remoteDescriptionSet = false;

  const flushIce = async () => {
    const copy = pendingRemoteIce.splice(0, pendingRemoteIce.length);
    for (const c of copy) {
      await pc.addIceCandidate(c);
    }
  };

  socket.on("signal:ice", (msg: { candidate?: RTCIceCandidateInit }) => {
    const candidate = msg?.candidate;
    if (!candidate) return;
    if (remoteDescriptionSet) void pc.addIceCandidate(candidate);
    else pendingRemoteIce.push(candidate);
  });

  const answerPromise = new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("WebRTC answer timeout")), 45_000);
    socket.once("signal:answer", async (msg: { sdp?: RTCSessionDescriptionInit }) => {
      try {
        const sdp = msg?.sdp;
        if (!sdp) throw new Error("missing sdp");
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        remoteDescriptionSet = true;
        await flushIce();
        window.clearTimeout(timer);
        resolve();
      } catch (e) {
        window.clearTimeout(timer);
        reject(e);
      }
    });
  });

  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      socket.emit("signal:ice", {
        requestId,
        candidate: ev.candidate.toJSON()
      });
    }
  };

  const dc = pc.createDataChannel("stellartap", { ordered: true });

  const payloadPromise = new Promise<string>((resolve, reject) => {
    dc.onopen = async () => {
      try {
        onStatus("Data channel open — proximity check…");
        const median = await measureMedianRttMs(dc, { pings: pingCount, timeoutMs: 5000 });
        onStatus(`Median RTT ${median.toFixed(0)} ms (max ${maxMedianRttMs})`);
        if (median > maxMedianRttMs) {
          reject(new Error(`Move phones closer (RTT ${median.toFixed(0)} ms)`));
          return;
        }
        sendJson(dc, { t: "ready" });

        let payloadTimer: number | undefined;
        const onMsg = (ev: MessageEvent) => {
          try {
            const m = JSON.parse(String(ev.data)) as { t?: string; body?: string };
            if (m.t === "payload" && typeof m.body === "string") {
              if (payloadTimer !== undefined) window.clearTimeout(payloadTimer);
              dc.removeEventListener("message", onMsg);
              resolve(m.body);
            }
          } catch {
            /* ignore */
          }
        };
        dc.addEventListener("message", onMsg);
        payloadTimer = window.setTimeout(() => {
          dc.removeEventListener("message", onMsg);
          reject(new Error("payload timeout"));
        }, 30_000);
      } catch (e) {
        reject(e);
      }
    };
    dc.onerror = () => reject(new Error("DataChannel error"));
  });

  await pc.setLocalDescription(await pc.createOffer());
  socket.emit("signal:offer", { requestId, sdp: pc.localDescription });

  await answerPromise;
  onStatus("WebRTC connected — waiting for payload…");

  const payload = await payloadPromise;

  const sendTxHash = (hash: string) => {
    sendJson(dc, { t: "txhash", hash });
  };

  const close = () => {
    try {
      dc.close();
    } catch {
      /* */
    }
    pc.close();
    socket.close();
  };

  return { payload, sendTxHash, close };
}
