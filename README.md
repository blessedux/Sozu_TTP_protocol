# StellarTap — P2P payment primitive (monorepo)

This repo holds the **infrastructure layer** for StellarTap: open, transport-agnostic **payment requests**, **self-custodial signing**, and **on-chain verification**. Product UIs (full wallet, merchant / POS surfaces, mobile shells) are intended to sit **on top of** these primitives—not replace them.

See [`StellarTap_architecture_spec.md`](StellarTap_architecture_spec.md) for non‑negotiables and [`docs/`](docs/) for protocol notes (envelope, SEP‑7, security, roadmap).

---

## What the primitive is

- **Peer → merchant value move on Stellar only**  
  The payer’s wallet **builds, signs, and submits** the Stellar transaction. The merchant side **never** submits transactions on behalf of the payer (regulation-aware posture: not acting as a payment processor for someone else’s funds).

- **Request, not rail**  
  The merchant shares a **payment request** (encoded payload / SEP‑7-style URL over **QR** today; **NFC / BLE** later). The request is *not* an executable transaction until the payer confirms in the wallet.

- **Match on-chain**  
  The merchant tool watches **Horizon** for a payment to its address that matches **amount** (normalized to stroops) and a **memo** derived from the session nonce (`st:<first 24 hex chars of nonce>`, aligned with the wallet).

---

## Current end-to-end flow (working today)

Roughly: **Merchant (request) → QR/payload → Wallet (pay) → Stellar → Merchant (verify)**.

1. **Merchant** (`apps/merchant-web`): enter receiving **Stellar address (G…)** and **amount (XLM, testnet)** → **Create request** → session nonce + QR payload (`stellartap:v1:…` envelope encoding).
2. **Wallet** (`apps/wallet-web`): optionally **create key** and **Fund via Friendbot** (testnet) → paste payload from merchant → **Parse request** → **Confirm & send** → transaction submitted to Horizon.
3. **Merchant**: **Start verify** → polls Horizon until a matching payment + memo is seen → **“Transaction detected on Stellar”** + tx hash.

Optional: **`apps/relayer`** — minimal **read-only** watcher + SSE hooks; **does not** build, sign, or submit transactions. Push (APNs/FCM) is a later layer on the same idea.

Headless proof (CI / local):

```bash
npm install
npm run e2e:testnet
```

---

## How it will work when “minimized” and wrapped by product UIs

The **same primitive** is what we’ll embed in:

| Layer | Role |
|--------|------|
| **`packages/protocol-core`** | `RequestEnvelope` schema + validation |
| **`packages/protocol-qr`** | Encode/decode QR payloads (envelope + passthrough for SEP‑7 URLs) |
| **`packages/stellar-intent`** | Envelope → tx blueprint (timebounds, network, memo hints) |
| **Wallet (web now; native later)** | Keys local, parse request, confirm, **submit to Horizon** |
| **Merchant / POS (web now; terminal UI later)** | Create request, show QR/NFC, **verify via Horizon** |

**Wallet** and **POS** become **frontends + device features** (camera, NFC, biometrics) that call this stack—not a second payment rail.

---

## Monorepo layout

| Path | Purpose |
|------|---------|
| `apps/wallet-web` | Payer testnet wallet (Vite) — Friendbot, parse payload, pay |
| `apps/merchant-web` | Merchant request + QR + Horizon verification |
| `apps/relayer` | Optional notification / SSE helper (no tx submission) |
| `packages/protocol-core` | Shared envelope types and encoding |
| `packages/protocol-qr` | QR / URL payload helpers (browser-safe, no `Buffer`) |
| `packages/stellar-intent` | Envelope → payment blueprint |
| `packages/stellar-tx-ios` | Placeholder Swift package for future native wallet |
| `scripts/e2e-testnet.mjs` | Headless testnet payer → merchant + detection |
| `docs/` | Architecture, SEP‑7, security, roadmap |

---

## Local development

From repo root:

```bash
npm install
```

Run apps (two URLs—use LAN hosts for two phones):

```bash
npm run dev:merchant   # default http://localhost:5173
npm run dev:wallet     # default http://localhost:5174
```

Or all at once (includes relayer):

```bash
npm run dev:all
```

Tests for shared packages:

```bash
npm test
```

---

## Technical notes

- **Testnet**: Horizon `https://horizon-testnet.stellar.org`, Friendbot for funding.
- **Browser + Stellar SDK**: `apps/wallet-web` polyfills **`Buffer`** (`buffer` + `vite.config.ts`) because `@stellar/stellar-sdk` expects Node globals in the bundle.
- **Amount matching**: Horizon returns decimal strings (e.g. `1.0000000`); merchant verification compares **stroops** so `1` and `1.0000000` match.

---

## License / contribution

Protocol and repo structure are meant to stay **boring and explicit**: one way to request, one way to pay, one way to verify on-chain. Extend via new transports and UIs, not duplicate settlement logic.
