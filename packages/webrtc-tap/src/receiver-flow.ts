import { io, type Socket } from "socket.io-client";
import { DEFAULT_ICE_SERVERS } from "./default-ice";
import { sendJson } from "./json-channel";

export type ReceiverTapSession = {
  socket: Socket;
  close: () => void;
};

/**
 * Receiver binds to a requestId after POST /active-requests; answers WebRTC and sends payload on DataChannel after payer `ready`.
 */
export function startReceiverTapSession(opts: {
  signalingUrl: string;
  requestId: string;
  bindSecret: string;
  payloadToSend: string;
  iceServers?: RTCIceServer[];
  onStatus?: (s: string) => void;
  onTxHash?: (hash: string) => void;
}): ReceiverTapSession {
  const {
    signalingUrl,
    requestId,
    bindSecret,
    payloadToSend,
    iceServers = DEFAULT_ICE_SERVERS,
    onStatus = () => {},
    onTxHash = () => {}
  } = opts;

  const socket: Socket = io(signalingUrl, {
    transports: ["websocket", "polling"],
    autoConnect: true
  });

  let pc: RTCPeerConnection | null = null;
  const pendingIce: RTCIceCandidateInit[] = [];

  socket.on("connect", () => {
    socket.emit("receiver:bind", { requestId, bindSecret }, (r: { ok: boolean; error?: string }) => {
      if (!r?.ok) onStatus(`Bind failed: ${r?.error ?? "unknown"}`);
      else onStatus("Waiting for payer tap…");
    });
  });

  socket.on("signal:ice", (msg: { candidate?: RTCIceCandidateInit }) => {
    const candidate = msg?.candidate;
    if (!candidate) return;
    if (pc?.remoteDescription) void pc.addIceCandidate(candidate);
    else pendingIce.push(candidate);
  });

  socket.on("signal:offer", async (msg: { sdp?: RTCSessionDescriptionInit }) => {
    const sdp = msg?.sdp;
    if (!sdp) return;
    try {
      if (!pc) {
        pc = new RTCPeerConnection({ iceServers });
        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            socket.emit("signal:ice", {
              requestId,
              candidate: ev.candidate.toJSON()
            });
          }
        };
        pc.ondatachannel = (ev) => {
          attachReceiverChannel(ev.channel, {
            payloadToSend,
            onStatus,
            onTxHash
          });
        };
      }

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      for (const c of pendingIce.splice(0, pendingIce.length)) {
        await pc.addIceCandidate(c);
      }
      await pc.setLocalDescription(await pc.createAnswer());
      socket.emit("signal:answer", { requestId, sdp: pc.localDescription });
      onStatus("WebRTC answering…");
    } catch (e) {
      onStatus(`WebRTC error: ${(e as Error).message}`);
    }
  });

  const close = () => {
    try {
      pc?.close();
    } catch {
      /* */
    }
    pc = null;
    socket.close();
  };

  return { socket, close };
}

function attachReceiverChannel(
  dc: RTCDataChannel,
  handlers: {
    payloadToSend: string;
    onStatus: (s: string) => void;
    onTxHash: (hash: string) => void;
  }
) {
  const { payloadToSend, onStatus, onTxHash } = handlers;

  dc.onopen = () => {
    onStatus("Data channel open (receiver)");
  };

  dc.onmessage = (ev) => {
    let m: { t?: string; id?: string; ts?: number; hash?: string };
    try {
      m = JSON.parse(String(ev.data)) as typeof m;
    } catch {
      return;
    }
    if (m.t === "ping" && m.id) {
      sendJson(dc, { t: "pong", id: m.id, ts: m.ts ?? 0 });
      return;
    }
    if (m.t === "ready") {
      sendJson(dc, { t: "payload", body: payloadToSend });
      onStatus("Payload sent to payer");
      return;
    }
    if (m.t === "txhash" && typeof m.hash === "string") {
      onTxHash(m.hash);
      onStatus("Tx hash received from payer");
    }
  };
}
