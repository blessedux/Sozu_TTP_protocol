import express from "express";
import { nanoid } from "nanoid";

const HORIZON_TESTNET = process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const PORT = Number(process.env.PORT ?? 8787);

/**
 * In-memory tracking store (MVP).
 * trackId -> { merchantAccount, amount, nonceShort, createdAt, status, txHash }
 */
const tracks = new Map();

/**
 * trackId -> Set(res)
 * Server-Sent Events clients to notify.
 */
const sseClients = new Map();

function json(res, status, body) {
  res.status(status).json(body);
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function nonceToShort(nonce) {
  return String(nonce).slice(0, 24);
}

function decimalToStroops(amount) {
  const s = String(amount).trim();
  if (!s) throw new Error("amount is empty");
  if (s.startsWith("-")) throw new Error("amount must be positive");
  const [wholeRaw, fracRaw = ""] = s.split(".");
  const whole = wholeRaw === "" ? "0" : wholeRaw;
  const frac = (fracRaw + "0000000").slice(0, 7);
  if (!/^\d+$/.test(whole) || !/^\d{7}$/.test(frac)) {
    throw new Error("amount is not a valid decimal");
  }
  return BigInt(whole) * 10000000n + BigInt(frac);
}

async function horizonGet(path) {
  const url = `${HORIZON_TESTNET}${path}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Horizon ${res.status}: ${text || url}`);
  }
  return await res.json();
}

async function checkTrackOnce(trackId) {
  const t = tracks.get(trackId);
  if (!t || t.status === "detected") return;

  const payments = await horizonGet(
    `/accounts/${encodeURIComponent(t.merchantAccount)}/payments?order=desc&limit=10`
  );
  const records = payments?._embedded?.records ?? [];
  const want = decimalToStroops(t.amount);

  for (const r of records) {
    if (r.type !== "payment") continue;
    if (decimalToStroops(r.amount) !== want) continue;

    const txHash = r.transaction_hash;
    const tx = await horizonGet(`/transactions/${txHash}`);

    const memo = tx.memo_type === "none" ? null : tx.memo;
    if (!memo) continue;
    const needle = `st:${t.nonceShort}`;
    if (!String(memo).includes(needle)) continue;

    t.status = "detected";
    t.txHash = txHash;
    t.detectedAt = nowSec();
    tracks.set(trackId, t);
    notify(trackId, { type: "detected", txHash });
    return;
  }
}

function notify(trackId, event) {
  const clients = sseClients.get(trackId);
  if (!clients) return;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    res.write(data);
  }
}

async function pollLoop() {
  for (const trackId of tracks.keys()) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await checkTrackOnce(trackId);
    } catch {
      // swallow transient errors; clients can also poll /track/:id
    }
  }
  setTimeout(pollLoop, 2000);
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

/**
 * Create a track request.
 * Body: { merchantAccount, amount, sessionNonce }
 * We track nonceShort (24 chars) because wallet memo encodes st:<nonceShort>.
 */
app.post("/track", (req, res) => {
  const { merchantAccount, amount, sessionNonce } = req.body ?? {};
  if (!merchantAccount || !amount || !sessionNonce) {
    return json(res, 400, { error: "merchantAccount, amount, sessionNonce required" });
  }

  const trackId = nanoid();
  const nonceShort = nonceToShort(sessionNonce);
  const createdAt = nowSec();

  tracks.set(trackId, {
    trackId,
    merchantAccount,
    amount: String(amount),
    nonceShort,
    createdAt,
    status: "tracking",
    txHash: null
  });

  return json(res, 200, { trackId, status: "tracking", nonceShort });
});

/**
 * Poll track status.
 */
app.get("/track/:trackId", (req, res) => {
  const t = tracks.get(req.params.trackId);
  if (!t) return json(res, 404, { error: "not found" });
  return json(res, 200, t);
});

/**
 * SSE stream for track updates.
 */
app.get("/track/:trackId/events", (req, res) => {
  const t = tracks.get(req.params.trackId);
  if (!t) return json(res, 404, { error: "not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  // initial state
  res.write(`data: ${JSON.stringify({ type: "status", status: t.status, txHash: t.txHash })}\n\n`);

  const set = sseClients.get(t.trackId) ?? new Set();
  set.add(res);
  sseClients.set(t.trackId, set);

  req.on("close", () => {
    const cur = sseClients.get(t.trackId);
    if (!cur) return;
    cur.delete(res);
    if (cur.size === 0) sseClients.delete(t.trackId);
  });
});

/**
 * Push tokens (stubs for later APNs/FCM integration).
 * This endpoint intentionally does NOT send pushes in MVP.
 */
app.post("/device-token", (req, res) => {
  const { kind, token } = req.body ?? {};
  if (!kind || !token) return json(res, 400, { error: "kind, token required" });
  return json(res, 200, { ok: true, stored: false, note: "push not implemented in MVP relayer" });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[relayer] listening on http://localhost:${PORT} horizon=${HORIZON_TESTNET}`);
});

pollLoop();

