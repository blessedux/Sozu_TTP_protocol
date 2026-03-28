import { io, type Socket } from "socket.io-client";

export type PublicActiveRequest = {
  requestId: string;
  username: string;
  amount: string;
  asset: string;
  expiresAt: number;
};

/**
 * Live updates for the payer “nearby requests” list (Socket.io + REST refresh).
 */
export function subscribePayerRequestList(opts: {
  signalingUrl: string;
  onList: (requests: PublicActiveRequest[]) => void;
}): { close: () => void; socket: Socket } {
  const { signalingUrl, onList } = opts;

  const pull = async () => {
    try {
      const res = await fetch(`${signalingUrl.replace(/\/$/, "")}/active-requests`);
      if (!res.ok) return;
      const j = (await res.json()) as { requests?: PublicActiveRequest[] };
      onList(j.requests ?? []);
    } catch {
      /* ignore */
    }
  };

  const socket: Socket = io(signalingUrl, {
    transports: ["websocket", "polling"],
    autoConnect: true
  });

  socket.on("connect", () => {
    socket.emit("payer:subscribe", {}, (_r: { ok?: boolean }) => {
      void pull();
    });
    void pull();
  });

  socket.on("requests:added", () => void pull());
  socket.on("requests:removed", () => void pull());
  socket.on("reconnect", () => void pull());

  return {
    socket,
    close: () => {
      socket.close();
    }
  };
}
