# WebRTC tap-to-pay (NFC-like UX, no NFC/Bluetooth)

**Version:** 1.0  
**Date:** March 27, 2026  
**Status:** Architecture adopted — implementation tracked in repo roadmap  
**Goal:** One-tap, **proximity-gated** peer-to-peer payment requests that feel like contactless tap-to-pay, **cross-platform** (iOS Safari + Android Chrome), **100% web/PWA**, **non-custodial**, using **Stellar SEP-0007** (or equivalent envelope) over **`RTCDataChannel`**.

**Explicit non-goals:** NFC, Bluetooth LE, Web Bluetooth, and HCE are **not** part of this plan. Proximity is approximated with **DataChannel RTT**, not radio ranging.

**Username / discovery:** Production will likely tie **receiver identity** to your **existing username database** (HTTPS session or token on POST/WebSocket). Until that exists, an MVP can use **ephemeral display names** with strict rate limits and TTL—same WebRTC flow, weaker sybil resistance.

---

## 1. Overview

- Receiver sets amount → **Create request** → request is **visible to nearby payers** via **username-based discovery** on a small signaling service.
- Payer opens **Pay nearby** → sees **request cards** → taps one → **WebRTC** handshake (offer/answer/ICE via WebSocket) → phones brought close → **RTT gate** passes → **full SEP-0007 URI** crosses the DataChannel → payer **signs & submits** on-chain → optional **tx hash** back on channel → both sides **haptics + success UI**.
- **Happy path:** no QR. **Fallback:** if WebRTC fails, show **QR (or copy)** of the same SEP-0007 URI.
- **Server** never needs private keys or signed transactions; minimize exposure of the **full** payment URI (stub + post-handshake delivery is acceptable).

---

## 2. High-level architecture

```
PWA (Wallet / Receiver)          Signaling server (tiny)
├── Vite + PWA                   ├── Node.js + Express
├── @stellar/stellar-sdk         ├── Socket.io (WebSocket)
├── RTCPeerConnection            ├── active_requests (TTL ~90s)
├── RTCDataChannel               └── rooms per requestId
├── socket.io-client
├── navigator.vibrate + confetti (optional polish)
└── Service Worker (install)
```

**After ICE connects**, sensitive request content flows **only** over the encrypted peer link (DTLS).

---

## 3. User flow (target: order of seconds to “ready”)

### Receiver — “Receive payment”

1. Amount (+ optional memo/asset).
2. **Create request** → build SEP-0007 URI (`stellar:pay?...` or project’s HTTPS wrapper).
3. **POST** `/active-requests` with **username**, **requestId**, **expiresAt**, and either a **stub** or encrypted handle (policy choice: avoid storing full URI server-side).
4. UI: **Waiting for tap…** (pulsing).

### Payer — “Pay nearby”

1. WebSocket subscription to **live requests** (created in last **90s**), keyed by discovery rules (e.g. same “venue” or global username list—product decision).
2. Tap a **card** → join signaling **room** for that `requestId` → start WebRTC as **offerer** or **answerer** per role convention (document one fixed role per side to avoid glare).

### Proximity gate

1. Open **ordered, reliable** DataChannel.
2. Exchange **several** small ping/pong messages (e.g. 5× 32-byte payloads).
3. Compute **average or median RTT**. Threshold example: **&lt; 80 ms** ⇒ “close enough” (tune empirically).
4. If **&lt; threshold**: send **full SEP-0007 URI** to payer → wallet parses → build/sign/submit → send **tx hash** (and optional status) back.
5. Both: `navigator.vibrate([100, 50, 100])` + success overlay.

### Fallbacks

| Condition | UX |
|-----------|-----|
| RTT **&gt; ~150 ms** (configurable) | Gentle “Move phones closer” + countdown/retry |
| WebRTC fails | Immediate **QR** / copy link for same URI |
| TTL elapsed | Request disappears from list; receiver may recreate |

---

## 4. Recommended packages (2026)

- **WebRTC**: Native browser APIs (no heavy wrapper required for MVP).
- **Stellar**: `@stellar/stellar-sdk` (v12+); SEP-0007 encoding (project helpers or `@stellarguard/stellar-uri` if adopted).
- **Signaling**: `socket.io` + `socket.io-client`.
- **PWA**: `vite-plugin-pwa` (or equivalent).
- **Polish**: `canvas-confetti`; haptics via `navigator.vibrate` where supported.

**Backend:** Node 22, Express, Socket.io, **Redis or in-memory Map** + TTL for `active_requests`. Optional Postgres for **audit** only—not required for core tap.

**ICE:** Public **STUN** + **TURN** (coturn, Twilio, or similar) for cellular and symmetric NAT.

---

## 5. Proximity without NFC/BT

- **Primary signal:** DataChannel **RTT** between the two browsers on the same local-ish network path when devices are physically close (empirical threshold per product).
- **No Bluetooth RSSI** in v1 (explicitly out of scope).

---

## 6. Security & privacy

- WebRTC user data is **DTLS-encrypted** end-to-end between peers.
- Signaling server must **not** log full SEP-0007 strings if avoidable.
- **90s TTL** limits replay window; rate-limit connections per username/IP.
- Payer must **explicitly** open Pay nearby and **tap** a card—no silent background discovery of payments.
- Keys never leave the device; server never signs txs.

---

## 7. Implementation roadmap (engineering)

Roughly **2–3 weeks** for a focused MVP, mapped to **this monorepo**:

| Phase | Work | Suggested location / notes |
|-------|------|----------------------------|
| **A** | Socket.io server + `active_requests` store (TTL, rate limits) | New `apps/signaling` **or** extend `apps/relayer` with a dedicated namespace (keep concerns separable). |
| **B** | Receiver: SEP-7 generation + POST register + “waiting” UI | `apps/merchant-web` (or unified PWA with modes). |
| **C** | Payer: WebSocket list + request cards | `apps/wallet-web`. |
| **D** | WebRTC offer/answer + ICE + DataChannel + **RTT gate** | Shared `packages/` helper (e.g. `packages/webrtc-session`) to avoid duplicating logic. |
| **E** | Wire DataChannel payload → existing **parse → stellar-intent → submit** | Reuse `packages/stellar-intent`, `protocol-core`. |
| **F** | Return tx hash on channel; receiver verifies Horizon (existing) | Merchant side polling/stream already conceptually present. |
| **G** | Haptics, confetti, PWA manifest / install | Apps’ Vite config. |
| **H** | Matrix test: iOS Safari + Android Chrome cross-devices | Manual + optional scripted smoke. |

**Challenges (short):**

- **iOS background throttling** → foreground + `wakeLock` where available; document “keep screen on during tap.”
- **ICE failures** → TURN mandatory for production; monitor candidate pairs.
- **RTT calibration** → ship configurable threshold; optional one-time user calibration later.

---

## 8. Relation to existing primitive

- **Unchanged:** Request semantics, memo binding, Horizon verification, wallet-only submit.
- **New:** Discovery + signaling + WebRTC + RTT gate + success path without QR.
- **QR** remains the **compatibility and failure** path, not the primary story in product copy.

See also [`architecture.md`](architecture.md), [`roadmap.md`](roadmap.md), and root [`README.md`](../README.md).
