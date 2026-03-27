import { Buffer } from "buffer";

// @stellar/stellar-sdk bundles assume Node's Buffer exists at runtime in the browser.
if (typeof (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer === "undefined") {
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

import {
  Asset,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  BASE_FEE,
  Memo,
  Horizon
} from "@stellar/stellar-sdk";

import { decodeQrPayload } from "@stellartap/protocol-qr";
import type { RequestEnvelope } from "@stellartap/protocol-core";
import { envelopeToBlueprint } from "@stellartap/stellar-intent";

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const FRIENDBOT = "https://friendbot.stellar.org";

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el;
}

function setText(id: string, value: string) {
  $(id).textContent = value;
}

function getStoredSecret(): string | null {
  return localStorage.getItem("stellartap.secret");
}

function storeSecret(secret: string) {
  localStorage.setItem("stellartap.secret", secret);
}

async function friendbotFund(publicKey: string): Promise<void> {
  const res = await fetch(`${FRIENDBOT}?addr=${encodeURIComponent(publicKey)}`);
  if (!res.ok) throw new Error(`Friendbot failed: ${res.status}`);
}

async function fetchAccount(publicKey: string) {
  const server = new Horizon.Server(HORIZON_TESTNET);
  return await server.loadAccount(publicKey);
}

function parseEnvelopeFromQr(raw: string): RequestEnvelope {
  const decoded = decodeQrPayload(raw);
  if (decoded.kind === "sep7") {
    // MVP: support envelope only (merchant-web produces envelope payload).
    throw new Error("SEP-7 parsing not implemented in MVP yet. Use envelope QR.");
  }
  return decoded.envelope;
}

async function submitPaymentTx(args: {
  secret: string;
  envelope: RequestEnvelope;
}): Promise<{ hash: string }> {
  const kp = Keypair.fromSecret(args.secret);
  const payer = kp.publicKey();

  const bp = envelopeToBlueprint(args.envelope, payer, {
    networkPassphrasePublic: Networks.PUBLIC,
    networkPassphraseTestnet: Networks.TESTNET,
    defaultTtlSeconds: 300
  });

  const server = new Horizon.Server(HORIZON_TESTNET);
  const account = await server.loadAccount(payer);

  const txb = new TransactionBuilder(account, {
    fee: String(BASE_FEE),
    networkPassphrase: bp.networkPassphrase,
    timebounds: {
      minTime: 0,
      maxTime: bp.timebounds.maxTime
    }
  }).addOperation(
    Operation.payment({
      destination: bp.destination,
      asset: Asset.native(),
      amount: bp.amount
    })
  );

  // Memo: include nonce in a safe way (text memo limit is 28 bytes).
  // Use a short prefix + truncated nonce for MVP matching.
  const nonceShort = args.envelope.sessionNonce.slice(0, 24);
  txb.addMemo(Memo.text(`st:${nonceShort}`));

  const tx = txb.build();
  tx.sign(kp);

  const res = await server.submitTransaction(tx);
  return { hash: res.hash };
}

function renderApp() {
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <main style="max-width:720px;margin:40px auto;font-family:ui-sans-serif,system-ui;padding:0 16px;">
      <h1>StellarTap Wallet (Testnet)</h1>
      <p>Self-custodial testnet wallet. Receives a request envelope QR payload, confirms, and submits a Stellar payment directly.</p>

      <section style="display:grid;gap:12px;">
        <div><strong>Public key:</strong> <span id="pub">-</span></div>
        <div><strong>Has secret stored:</strong> <span id="hasSecret">-</span></div>
        <div>
          <button id="createKey" style="padding:10px 14px;">Create new key (store locally)</button>
          <button id="fund" style="padding:10px 14px;" disabled>Fund via Friendbot</button>
          <button id="refresh" style="padding:10px 14px;" disabled>Refresh balance</button>
        </div>
        <div><strong>Balance (XLM):</strong> <span id="balance">-</span></div>
      </section>

      <hr style="margin:24px 0;" />

      <section style="display:grid;gap:12px;">
        <label>Paste scanned QR payload (from merchant app)
          <textarea id="qrInput" style="width:100%;min-height:90px;padding:10px;" placeholder="stellartap:v1:..."></textarea>
        </label>
        <button id="parse" style="padding:10px 14px;">Parse request</button>
        <div><strong>Request destination:</strong> <span id="dest">-</span></div>
        <div><strong>Request amount:</strong> <span id="amt">-</span></div>
        <div><strong>Request nonce:</strong> <span id="nonce">-</span></div>
        <button id="send" style="padding:10px 14px;" disabled>Confirm & send</button>
        <div><strong>Status:</strong> <span id="status">idle</span></div>
        <div><strong>Tx hash:</strong> <span id="txHash">-</span></div>
      </section>
    </main>
  `;

  const createBtn = $("createKey") as HTMLButtonElement;
  const fundBtn = $("fund") as HTMLButtonElement;
  const refreshBtn = $("refresh") as HTMLButtonElement;
  const parseBtn = $("parse") as HTMLButtonElement;
  const sendBtn = $("send") as HTMLButtonElement;
  const qrInput = $("qrInput") as HTMLTextAreaElement;

  let currentEnv: RequestEnvelope | null = null;

  const syncKeyState = () => {
    const secret = getStoredSecret();
    if (!secret) {
      setText("pub", "-");
      setText("hasSecret", "no");
      fundBtn.disabled = true;
      refreshBtn.disabled = true;
      return;
    }
    const kp = Keypair.fromSecret(secret);
    setText("pub", kp.publicKey());
    setText("hasSecret", "yes");
    fundBtn.disabled = false;
    refreshBtn.disabled = false;
  };

  createBtn.onclick = () => {
    const kp = Keypair.random();
    storeSecret(kp.secret());
    syncKeyState();
    setText("status", "new key created");
  };

  fundBtn.onclick = async () => {
    const secret = getStoredSecret();
    if (!secret) return;
    const kp = Keypair.fromSecret(secret);
    setText("status", "funding via friendbot…");
    try {
      await friendbotFund(kp.publicKey());
      setText("status", "funded");
    } catch (e: any) {
      setText("status", `error: ${e?.message ?? String(e)}`);
    }
  };

  refreshBtn.onclick = async () => {
    const secret = getStoredSecret();
    if (!secret) return;
    const kp = Keypair.fromSecret(secret);
    setText("status", "loading account…");
    try {
      const acct: any = await fetchAccount(kp.publicKey());
      const balances = acct.balances ?? [];
      const xlm = balances.find((b: any) => b.asset_type === "native");
      setText("balance", xlm?.balance ?? "0");
      setText("status", "ready");
    } catch (e: any) {
      setText("status", `error: ${e?.message ?? String(e)}`);
    }
  };

  parseBtn.onclick = () => {
    setText("txHash", "-");
    setText("status", "parsing…");
    try {
      const env = parseEnvelopeFromQr(qrInput.value);
      currentEnv = env;
      setText("dest", env.merchantAccount);
      setText("amt", `${env.amount} ${env.asset}`);
      setText("nonce", env.sessionNonce);
      sendBtn.disabled = false;
      setText("status", "request parsed");
    } catch (e: any) {
      currentEnv = null;
      sendBtn.disabled = true;
      setText("status", `error: ${e?.message ?? String(e)}`);
    }
  };

  sendBtn.onclick = async () => {
    const secret = getStoredSecret();
    if (!secret || !currentEnv) return;
    sendBtn.disabled = true;
    setText("status", "submitting…");
    try {
      const { hash } = await submitPaymentTx({ secret, envelope: currentEnv });
      setText("txHash", hash);
      setText("status", "sent (check merchant tool)");
    } catch (e: any) {
      setText("status", `error: ${e?.message ?? String(e)}`);
    } finally {
      sendBtn.disabled = false;
    }
  };

  syncKeyState();
}

renderApp();

