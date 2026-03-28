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
import {
  payerTapExchange,
  subscribePayerRequestList,
  type PublicActiveRequest
} from "@stellartap/webrtc-tap";

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

function parseEnvelopeFromPayload(raw: string): RequestEnvelope {
  const decoded = decodeQrPayload(raw.trim());
  if (decoded.kind === "sep7") {
    throw new Error("SEP-7 parsing not implemented in MVP yet. Use envelope payload.");
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
        <h2 style="margin:0;font-size:1.1rem;">Pay nearby (WebRTC tap)</h2>
        <label>Signaling server\n
          <input id="signalingUrl" style="width:100%;padding:10px;" placeholder="http://localhost:8788" value="http://localhost:8788" />
        </label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="listenNearby" type="button" style="padding:10px 14px;">Listen for nearby requests</button>
          <button id="stopListen" type="button" style="padding:10px 14px;" disabled>Stop listening</button>
        </div>
        <div id="nearbyList" style="display:grid;gap:8px;"></div>
      </section>

      <hr style="margin:24px 0;" />

      <section style="display:grid;gap:12px;">
        <h2 style="margin:0;font-size:1.1rem;">Or paste QR payload</h2>
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
  const signalingUrlInput = $("signalingUrl") as HTMLInputElement;
  const listenNearbyBtn = $("listenNearby") as HTMLButtonElement;
  const stopListenBtn = $("stopListen") as HTMLButtonElement;
  const nearbyListEl = $("nearbyList") as HTMLDivElement;

  let currentEnv: RequestEnvelope | null = null;
  let nearbySub: { close: () => void } | null = null;

  function renderNearbyList(requests: PublicActiveRequest[]) {
    nearbyListEl.replaceChildren();
    const base = signalingUrlInput.value.trim().replace(/\/$/, "");
    if (requests.length === 0) {
      const p = document.createElement("p");
      p.style.margin = "0";
      p.style.opacity = "0.7";
      p.textContent = "No active requests (create one on merchant, same signaling URL).";
      nearbyListEl.appendChild(p);
      return;
    }
    for (const r of requests) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.flexWrap = "wrap";
      row.style.gap = "8px";
      row.style.alignItems = "center";
      row.style.padding = "8px";
      row.style.border = "1px solid #ccc";
      row.style.borderRadius = "8px";

      const label = document.createElement("span");
      label.textContent = `${r.username} · ${r.amount} ${r.asset}`;
      row.appendChild(label);

      const tapBtn = document.createElement("button");
      tapBtn.type = "button";
      tapBtn.style.padding = "8px 12px";
      tapBtn.textContent = "Tap to pay";
      tapBtn.onclick = async () => {
        if (!base) {
          setText("status", "Set signaling URL first");
          return;
        }
        const secret = getStoredSecret();
        if (!secret) {
          setText("status", "Create a key first");
          return;
        }
        tapBtn.disabled = true;
        setText("status", "tap: connecting…");
        try {
          const { payload, sendTxHash, close } = await payerTapExchange({
            signalingUrl: base,
            requestId: r.requestId,
            onStatus: (s) => setText("status", s)
          });
          const env = parseEnvelopeFromPayload(payload);
          currentEnv = env;
          setText("dest", env.merchantAccount);
          setText("amt", `${env.amount} ${env.asset}`);
          setText("nonce", env.sessionNonce);
          sendBtn.disabled = false;
          setText("status", "tap: signing & sending…");
          const { hash } = await submitPaymentTx({ secret, envelope: env });
          sendTxHash(hash);
          setText("txHash", hash);
          setText("status", "sent via tap");
          close();
        } catch (e: any) {
          setText("status", `tap error: ${e?.message ?? String(e)}`);
        } finally {
          tapBtn.disabled = false;
        }
      };
      row.appendChild(tapBtn);
      nearbyListEl.appendChild(row);
    }
  }

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

  listenNearbyBtn.onclick = () => {
    nearbySub?.close();
    nearbySub = null;
    const base = signalingUrlInput.value.trim().replace(/\/$/, "");
    if (!base) {
      setText("status", "Set signaling URL");
      return;
    }
    listenNearbyBtn.disabled = true;
    stopListenBtn.disabled = false;
    setText("status", "listening for requests…");
    nearbySub = subscribePayerRequestList({
      signalingUrl: base,
      onList: (reqs) => renderNearbyList(reqs)
    });
  };

  stopListenBtn.onclick = () => {
    nearbySub?.close();
    nearbySub = null;
    listenNearbyBtn.disabled = false;
    stopListenBtn.disabled = true;
    nearbyListEl.replaceChildren();
    setText("status", "stopped listening");
  };

  parseBtn.onclick = () => {
    setText("txHash", "-");
    setText("status", "parsing…");
    try {
      const env = parseEnvelopeFromPayload(qrInput.value);
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

