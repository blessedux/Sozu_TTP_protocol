# StellarTap — P2P payment primitive (monorepo)

This repo holds the **infrastructure layer** for StellarTap: transport-agnostic **payment requests**, **self-custodial signing**, and **on-chain verification**. Product UIs (wallet, merchant / POS) sit **on top of** these primitives.

**Tap-to-pay direction (2026):** **WebRTC `RTCDataChannel` + a tiny signaling server** + **RTT-based proximity gate**—**not** NFC or Bluetooth. Cross-platform **iOS Safari ↔ Android Chrome** PWA. Details: [`docs/webrtc-tap-to-pay.md`](docs/webrtc-tap-to-pay.md) and [`StellarTap_architecture_spec.md`](StellarTap_architecture_spec.md).

---

## What the primitive is

- **Peer → merchant value move on Stellar only**  
  The payer’s wallet **builds, signs, and submits** the Stellar transaction. The receiver side **never** submits transactions on behalf of the payer.

- **Request, not rail**  
  The receiver shares a **payment request** (SEP‑7 / envelope). **Target transport:** encrypted **peer-to-peer** channel after signaling; **QR/paste** remain the universal fallback and today’s baseline.

- **Match on-chain**  
  The receiver tool watches **Horizon** for a payment that matches **amount** (stroop-normalized) and memo binding (e.g. `st:` + first 24 hex chars of nonce, aligned with the wallet).

---

## Target UX (WebRTC tap — planned)

1. **Receiver:** amount → **Create request** → registered on signaling (**username** discovery, ~90s TTL) → **“Waiting for tap…”**.
2. **Payer:** **Pay nearby** → live request list → **tap card** → WebRTC handshake → **proximity** (DataChannel RTT) → **full SEP‑7** on channel → sign/submit → optional **tx hash** back → haptics / success UI both sides.
3. **Fallback:** WebRTC or RTT fails → **same** SEP‑7 via **QR** (or copy).

See [`docs/webrtc-tap-to-pay.md`](docs/webrtc-tap-to-pay.md) for stack, security notes, and **implementation phases**.

---

## Current end-to-end flow (working today)

**Merchant (request) → QR or paste → Wallet (pay) → Stellar → Merchant (verify).**

1. **Merchant** (`apps/merchant-web`): receiving **Stellar address** + **amount (XLM, testnet)** → **Create request** → nonce + QR payload (`stellartap:v1:…`).
2. **Wallet** (`apps/wallet-web`): optional **Friendbot** fund → paste payload → **Parse** → **Confirm & send** → Horizon submit.
3. **Merchant**: **Start verify** → Horizon until match → **“Transaction detected on Stellar”** + tx hash.

Optional: **`apps/relayer`** — read-only watcher + SSE; **no** tx submission. **Signaling + Socket.io** for tap is the **next** app/service (see roadmap).

```bash
npm install
npm run e2e:testnet
```

---

## How packages map to Wallet + POS

| Layer | Role |
|--------|------|
| **`packages/protocol-core`** | `RequestEnvelope` schema + validation |
| **`packages/protocol-qr`** | QR payloads (envelope + SEP‑7 passthrough) |
| **`packages/stellar-intent`** | Envelope → tx blueprint |
| **Wallet PWA** | Keys local, parse request, **submit to Horizon**; **+ WebRTC payer flow** (planned) |
| **Receiver / POS PWA** | Create request, **register + wait for tap** (planned), **verify via Horizon** |

---

## Monorepo layout

| Path | Purpose |
|------|---------|
| `apps/wallet-web` | Payer testnet wallet (Vite) |
| `apps/merchant-web` | Receiver request + QR + Horizon verification |
| `apps/relayer` | Optional SSE / future push helper (no tx submission) |
| `packages/protocol-core` | Envelope types + encoding |
| `packages/protocol-qr` | QR / URL helpers (browser-safe) |
| `packages/stellar-intent` | Envelope → payment blueprint |
| `packages/stellar-tx-ios` | Placeholder for future native wallet |
| `scripts/e2e-testnet.mjs` | Headless testnet flow |
| `docs/` | Architecture, **WebRTC spec**, SEP‑7, security, roadmap |

---

## Local development

```bash
npm install
npm run dev:merchant   # http://localhost:5173
npm run dev:wallet     # http://localhost:5174
npm run dev:all        # includes relayer
npm test
```

---

## Technical notes

- **Testnet:** Horizon `https://horizon-testnet.stellar.org`, Friendbot for funding.
- **Wallet + Stellar SDK:** `Buffer` polyfill in `apps/wallet-web` for `@stellar/stellar-sdk`.
- **Amount matching:** compare **stroops** so `1` and `1.0000000` match.

---

## License / contribution

One request format, one verification model on-chain; add **transports** (WebRTC, QR, links) without duplicating settlement logic.
