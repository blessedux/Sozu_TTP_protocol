import QRCode from "qrcode";
import { encodeQrPayload } from "@stellartap/protocol-qr";
import type { RequestEnvelope } from "@stellartap/protocol-core";
import { validateEnvelope } from "@stellartap/protocol-core";

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el;
}

function randomNonceHex(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function decimalToStroops(amount: string): bigint {
  const s = amount.trim();
  if (!s) throw new Error("amount is empty");
  const neg = s.startsWith("-");
  if (neg) throw new Error("amount must be positive");
  const [wholeRaw, fracRaw = ""] = s.split(".");
  const whole = wholeRaw === "" ? "0" : wholeRaw;
  const frac = (fracRaw + "0000000").slice(0, 7);
  if (!/^\d+$/.test(whole) || !/^\d{7}$/.test(frac)) {
    throw new Error("amount is not a valid decimal");
  }
  return BigInt(whole) * 10_000_000n + BigInt(frac);
}

function createEnvelope(args: {
  merchantAccount: string;
  amount: string;
  network: "TESTNET" | "PUBLIC";
}): RequestEnvelope {
  const now = Math.floor(Date.now() / 1000);
  return {
    merchantAccount: args.merchantAccount.trim(),
    amount: args.amount.trim(),
    asset: "XLM",
    sessionNonce: randomNonceHex(16),
    createdAt: now,
    expiresAt: now + 300,
    network: args.network,
    protocolVersion: "1.0.0"
  };
}

async function pollForMatch(params: {
  merchantAccount: string;
  amount: string;
  nonce: string;
  signal: AbortSignal;
}): Promise<{ txHash: string } | null> {
  // MVP polling: check latest payments for merchant account and match on memo substring.
  const url = `${HORIZON_TESTNET}/accounts/${encodeURIComponent(
    params.merchantAccount
  )}/payments?order=desc&limit=10`;

  const res = await fetch(url, { signal: params.signal });
  if (!res.ok) throw new Error(`Horizon error: ${res.status}`);
  const json = await res.json();
  const records: any[] = json?._embedded?.records ?? [];
  const want = decimalToStroops(params.amount);

  for (const r of records) {
    // payment operations contain transaction_hash and amount, asset_type, etc.
    if (r.type !== "payment") continue;
    if (decimalToStroops(String(r.amount)) !== want) continue;

    // We need memo to match nonce. Payments record doesn't include memo; fetch tx.
    const txHash = r.transaction_hash;
    const txRes = await fetch(`${HORIZON_TESTNET}/transactions/${txHash}`, {
      signal: params.signal
    });
    if (!txRes.ok) continue;
    const tx = await txRes.json();

    const memo: string | null = tx.memo_type === "none" ? null : tx.memo;
    if (!memo) continue;
    // Wallet uses Memo.text(`st:${sessionNonce.slice(0, 24)}`) — match that prefix.
    const memoNeedle = `st:${params.nonce.slice(0, 24)}`;
    if (!memo.includes(memoNeedle)) continue;
    return { txHash };
  }

  return null;
}

function renderApp() {
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <main style="max-width:720px;margin:40px auto;font-family:ui-sans-serif,system-ui;padding:0 16px;">
      <h1>StellarTap Merchant (Testnet)</h1>
      <p>Create a request envelope and show it as a QR code. This tool verifies the transaction by reading Horizon.</p>

      <section style="display:grid;gap:12px;grid-template-columns:1fr;align-items:start;">
        <label>Merchant receiving address (G...)\n
          <input id="merchantAccount" style="width:100%;padding:10px;" placeholder="G..." />
        </label>
        <label>Amount (XLM)\n
          <input id="amount" style="width:100%;padding:10px;" value="1" />
        </label>
        <button id="create" style="padding:10px 14px;">Create request</button>
      </section>

      <hr style="margin:24px 0;" />

      <section style="display:grid;gap:12px;">
        <div><strong>Session nonce:</strong> <span id="nonce">-</span></div>
        <div><strong>QR payload:</strong></div>
        <textarea id="payload" style="width:100%;min-height:90px;padding:10px;" readonly></textarea>
        <canvas id="qr"></canvas>
        <div>
          <button id="startVerify" style="padding:10px 14px;" disabled>Start verify (poll Horizon)</button>
          <button id="stopVerify" style="padding:10px 14px;" disabled>Stop</button>
        </div>
        <div><strong>Status:</strong> <span id="status">idle</span></div>
        <div><strong>Tx hash:</strong> <span id="txHash">-</span></div>
      </section>
    </main>
  `;

  const merchantAccountInput = $("merchantAccount") as HTMLInputElement;
  const amountInput = $("amount") as HTMLInputElement;
  const createBtn = $("create") as HTMLButtonElement;
  const startVerifyBtn = $("startVerify") as HTMLButtonElement;
  const stopVerifyBtn = $("stopVerify") as HTMLButtonElement;
  const nonceEl = $("nonce");
  const payloadEl = $("payload") as HTMLTextAreaElement;
  const statusEl = $("status");
  const txHashEl = $("txHash");
  const qrCanvas = $("qr") as HTMLCanvasElement;

  let current: { envelope: RequestEnvelope; payload: string } | null = null;
  let aborter: AbortController | null = null;

  createBtn.onclick = async () => {
    txHashEl.textContent = "-";
    statusEl.textContent = "creating request…";
    createBtn.disabled = true;
    try {
      const env = createEnvelope({
        merchantAccount: merchantAccountInput.value,
        amount: amountInput.value,
        network: "TESTNET"
      });
      validateEnvelope(env);
      const payload = encodeQrPayload({ kind: "envelope", envelope: env });
      current = { envelope: env, payload };
      nonceEl.textContent = env.sessionNonce;
      payloadEl.value = payload;
      await QRCode.toCanvas(qrCanvas, payload, { width: 280, margin: 1 });
      statusEl.textContent = "request ready";
      startVerifyBtn.disabled = false;
    } catch (e: any) {
      statusEl.textContent = `error: ${e?.message ?? String(e)}`;
      current = null;
      startVerifyBtn.disabled = true;
    } finally {
      createBtn.disabled = false;
    }
  };

  startVerifyBtn.onclick = async () => {
    if (!current) return;
    aborter?.abort();
    aborter = new AbortController();
    startVerifyBtn.disabled = true;
    stopVerifyBtn.disabled = false;
    statusEl.textContent = "verifying…";

    try {
      while (!aborter.signal.aborted) {
        const match = await pollForMatch({
          merchantAccount: current.envelope.merchantAccount,
          amount: current.envelope.amount,
          nonce: current.envelope.sessionNonce,
          signal: aborter.signal
        });
        if (match) {
          txHashEl.textContent = match.txHash;
          statusEl.textContent = "transaction detected on Stellar";
          stopVerifyBtn.disabled = true;
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (e: any) {
      statusEl.textContent = `error: ${e?.message ?? String(e)}`;
    } finally {
      startVerifyBtn.disabled = false;
      stopVerifyBtn.disabled = true;
    }
  };

  stopVerifyBtn.onclick = () => {
    aborter?.abort();
    aborter = null;
    statusEl.textContent = "stopped";
    startVerifyBtn.disabled = false;
    stopVerifyBtn.disabled = true;
  };
}

renderApp();

