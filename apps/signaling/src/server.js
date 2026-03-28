import http from "http";
import express from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import { Server } from "socket.io";

const PORT = Number(process.env.PORT ?? 8788);
const DEFAULT_TTL_SEC = Number(process.env.ACTIVE_REQUEST_TTL_SEC ?? 90);

/** @typedef {{ requestId: string, username: string, amount: string, asset: string, expiresAt: number, bindSecret: string, receiverSocketId: string | null, payerSocketId: string | null }} ActiveRow */

/** @type {Map<string, ActiveRow>} */
const active = new Map();

function nowMs() {
  return Date.now();
}

function publicRequest(row) {
  return {
    requestId: row.requestId,
    username: row.username,
    amount: row.amount,
    asset: row.asset,
    expiresAt: row.expiresAt
  };
}

function listPublic() {
  const t = nowMs();
  return [...active.values()].filter((r) => r.expiresAt >= t).map(publicRequest);
}

function cleanupExpired(io) {
  const t = nowMs();
  for (const [id, row] of active) {
    if (row.expiresAt < t) {
      active.delete(id);
      io.emit("requests:removed", { requestId: id });
    }
  }
}

const app = express();
app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

app.get("/active-requests", (_req, res) => {
  res.json({ requests: listPublic() });
});

/**
 * Register a payment request for discovery (no full SEP-7 / envelope on server).
 * Body: { requestId, username, amount, asset?, expiresInSec? }
 */
app.post("/active-requests", (req, res) => {
  const body = req.body ?? {};
  const requestId = body.requestId;
  const username = body.username;
  const amount = body.amount;
  const asset = body.asset ?? "XLM";
  const expiresInSec = Math.min(300, Math.max(10, Number(body.expiresInSec ?? DEFAULT_TTL_SEC)));

  if (!requestId || typeof requestId !== "string" || requestId.length > 128) {
    return res.status(400).json({ error: "requestId required (string, max 128)" });
  }
  if (!username || typeof username !== "string" || username.length > 64) {
    return res.status(400).json({ error: "username required (string, max 64)" });
  }
  if (amount === undefined || amount === null || String(amount).length > 32) {
    return res.status(400).json({ error: "amount required" });
  }
  if (active.has(requestId)) {
    return res.status(409).json({ error: "requestId already active" });
  }

  const bindSecret = nanoid(40);
  const expiresAt = nowMs() + expiresInSec * 1000;

  active.set(requestId, {
    requestId,
    username: String(username).trim(),
    amount: String(amount).trim(),
    asset: String(asset).trim(),
    expiresAt,
    bindSecret,
    receiverSocketId: null,
    payerSocketId: null
  });

  /** @type {import('socket.io').Server} */
  const io = app.locals.io;
  io?.emit("requests:added", { request: publicRequest(active.get(requestId)) });

  return res.status(201).json({
    requestId,
    bindSecret,
    expiresAt,
    expiresInSec
  });
});

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: { origin: true, credentials: true }
});

app.locals.io = io;

setInterval(() => cleanupExpired(io), 4000);

io.on("connection", (socket) => {
  socket.on("receiver:bind", (payload, cb) => {
    const requestId = payload?.requestId;
    const bindSecret = payload?.bindSecret;
    const row = requestId ? active.get(requestId) : null;
    if (!row || row.bindSecret !== bindSecret) {
      cb?.({ ok: false, error: "invalid bind" });
      return;
    }
    row.receiverSocketId = socket.id;
    socket.join(`req:${requestId}`);
    socket.data.stellartapRole = "receiver";
    socket.data.stellartapRequestId = requestId;
    cb?.({ ok: true });
  });

  socket.on("payer:subscribe", (_payload, cb) => {
    socket.join("payers");
    cb?.({ ok: true, requests: listPublic() });
  });

  socket.on("payer:tap", (payload, cb) => {
    const requestId = payload?.requestId;
    const row = requestId ? active.get(requestId) : null;
    if (!row || row.expiresAt < nowMs()) {
      cb?.({ ok: false, error: "request not found or expired" });
      return;
    }
    if (!row.receiverSocketId) {
      cb?.({ ok: false, error: "receiver not connected" });
      return;
    }
    if (row.payerSocketId && row.payerSocketId !== socket.id) {
      cb?.({ ok: false, error: "request busy" });
      return;
    }
    row.payerSocketId = socket.id;
    socket.join(`req:${requestId}`);
    socket.data.stellartapRole = "payer";
    socket.data.stellartapRequestId = requestId;
    io.to(row.receiverSocketId).emit("payer:approaching", { requestId });
    cb?.({ ok: true });
  });

  socket.on("signal:offer", (payload) => {
    const requestId = payload?.requestId;
    const sdp = payload?.sdp;
    if (!requestId || !sdp) return;
    socket.to(`req:${requestId}`).emit("signal:offer", { sdp });
  });

  socket.on("signal:answer", (payload) => {
    const requestId = payload?.requestId;
    const sdp = payload?.sdp;
    if (!requestId || !sdp) return;
    socket.to(`req:${requestId}`).emit("signal:answer", { sdp });
  });

  socket.on("signal:ice", (payload) => {
    const requestId = payload?.requestId;
    const candidate = payload?.candidate;
    if (!requestId || !candidate) return;
    socket.to(`req:${requestId}`).emit("signal:ice", { candidate });
  });

  socket.on("disconnect", () => {
    for (const row of active.values()) {
      if (row.receiverSocketId === socket.id) row.receiverSocketId = null;
      if (row.payerSocketId === socket.id) row.payerSocketId = null;
    }
  });
});

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[signaling] http://localhost:${PORT} (active TTL default ${DEFAULT_TTL_SEC}s)`);
});
