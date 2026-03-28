**StellarTap Architecture Specification**  
**Version:** 2.0 (WebRTC tap-to-pay, PWA-first)  
**Date:** March 27, 2026  
**Project goal:** Build an open-protocol, self-custodial **tap-to-pay** experience on Stellar that works **iPhone ↔ iPhone, iPhone ↔ Android, Android ↔ Android**, entirely over **HTTPS + PWA**, without Apple Pay / Google Pay / card rails, and with **minimal “PSP processing” semantics** on the merchant side.

Full technical detail for the tap flow lives in [`docs/webrtc-tap-to-pay.md`](docs/webrtc-tap-to-pay.md).

---

### 1. Non-negotiables (immutable principles)

- **Stellar-only settlement**: Every transaction is a user-signed Stellar payment (or later Soroban where applicable). No Visa/Mastercard or closed tokenization rails.
- **Protocol-first transport**: Transports carry a **payment request** only—not a processing rail. Only the data needed to build a user-signed transaction crosses the wire peer-to-peer after signaling.
- **No NFC, no Bluetooth (by design)**: Proximity and “tap” feel come from **WebRTC `RTCDataChannel`** plus a **round-trip time (RTT) gate** on that channel, not from NFC, BLE, or Web Bluetooth. **QR remains an explicit fallback** when WebRTC fails (not the happy-path UX).
- **100% web/PWA for core flow**: `RTCPeerConnection` + `RTCDataChannel`, `socket.io` (or equivalent) for signaling, deployed on **HTTPS** only. No extra native apps required for the MVP tap experience.
- **Non-custodial**: Private keys and signed transactions never go to the signaling server. The server may hold **metadata** (username, `requestId`, TTL, ICE signaling)—not the full SEP-0007 payload if the design keeps a stub server-side until proximity passes (see webrtc doc).
- **CMF-safe execution model**: The merchant/receiver tool does **not** construct, sign, or submit the payer’s transaction. The **payer wallet** builds, signs, and submits to Horizon. The receiver **creates requests** and **verifies on-chain** matches (memo / amount / destination).
- **Cross-platform parity**: Same UX target on **iOS Safari** and **Android Chrome** (modern versions). STUN/TURN configured for cellular/symmetric NAT.
- **Human-right-to-transact ethos**: Open protocol spec; no KYC/AML baked into the protocol (app/anchor layer per jurisdiction). Security first: signing on-device; keys never exported.

---

### 2. Desired outcome UX (target)

**Receiver (“Receive payment”)**

1. Enter amount (and optional memo/asset).
2. Tap **Create request** → SEP-0007-style URI generated; session registered with signaling backend (**username-based discovery**, TTL ~90s).
3. UI: **“Waiting for tap…”** (pulsing). Nearby payers who opened **Pay nearby** see this request in a live list.

**Payer (“Pay nearby”)**

1. Opens wallet; subscribes to **active requests** for nearby sessions (WebSocket).
2. Sees **request cards** (username, amount, `requestId`). Taps **one** card → WebRTC handshake starts (offer/answer/ICE via signaling).
3. **`DataChannel` opens** → **proximity gate**: several small ping/pongs; **median RTT &lt; threshold** (e.g. ~80 ms, tunable) ⇒ treat as “phones close enough.”
4. **Full SEP-0007 URI** delivered over the encrypted `DataChannel` → wallet **builds, signs, submits** → optional **tx hash** returned on channel for instant dual-side confirmation.
5. **Haptics** (`navigator.vibrate`) + **celebration UI** on both sides when confirmed.

**Fallbacks**

- RTT too high → “Move phones closer” + retry; no payment until gate passes.
- WebRTC failure → **immediate QR** (or paste) with the **same** SEP-0007 payload.
- Request **expires** after TTL (e.g. 90s).

**Happy path**: no QR; payer explicitly chooses **Pay nearby** and taps a card (no background scanning).

---

### 3. High-level architecture

| Layer | Responsibility |
|--------|----------------|
| **PWA wallet (payer)** | Keys (IndexedDB / extension), SEP-7 parse, tx build/sign/submit, WebRTC + proximity, UI |
| **PWA receiver/merchant** | Create SEP-7 request, register with signaling, WebRTC answer side, Horizon verify |
| **Tiny signaling server** | HTTPS + **WebSocket** (e.g. Socket.io): `active_requests` TTL store, rooms per `requestId`, ICE relay only |
| **STUN/TURN** | Public ICE servers (e.g. coturn / hosted TURN) for reliability on mobile networks |
| **Horizon** | Submit + read-only verification |

**Data plane**: After ICE, **SEP-0007 URI and tx hash feedback** flow **only** over **DTLS-protected** WebRTC. Signaling server does **not** need full payment URI in logs if stub + channel delivery pattern is used.

**Optional later**: Minimal **relayer** (Horizon stream + push) for notifications—still **never** submits user transactions.

---

### 4. Protocol stack (unchanged semantics, new transports)

- **Request envelope** + **SEP-0007** remain the **canonical request** representation (same fields, memo binding, verification on Horizon).
- **New transport**: `DataChannel` bytes = SEP-0007 URI string (or envelope encoding that maps 1:1 to current `stellartap:v1` / SEP-7).
- **Discovery**: Username + `requestId` + expiry in server store; no wallet keys.

---

### 5. Tech stack (recommended)

- **Frontend**: Vite PWA (`vite-plugin-pwa`), `@stellar/stellar-sdk`, native WebRTC, `socket.io-client`, lightweight state (e.g. Zustand/Jotai), `canvas-confetti` for polish.
- **Backend**: Node 22 + Express + `socket.io`; in-memory or **Redis** for `active_requests` + TTL; rate limits per IP/username.
- **No** PeerJS/SimplePeer required for MVP (native APIs preferred).

---

### 6. Security, compliance, risks

- **E2E encryption**: WebRTC media/datachannel uses DTLS; treat signaling payloads as untrusted except session binding (`requestId`, user identity rules).
- **Replay / spam**: Short TTL, rate limits, explicit user tap on payer side.
- **Relay attacks**: RTT gate reduces remote relay; combine with short-lived requests and memo-bound txs.
- **iOS tab throttling**: `navigator.wakeLock` where allowed; keep foreground during tap; document limitations.
- **Compliance**: Same as prior spec—consult counsel for product positioning; protocol stays request + on-chain settlement.

---

### 7. MVP scope alignment

- **Done (primitive)**: Envelope, SEP-7, QR/paste path, wallet submits, merchant verifies on Horizon (see monorepo README).
- **Next (tap UX)**: Signaling service + receiver/payer WebRTC flows + RTT proximity + dual-side confirmation + PWA polish; QR as fallback only.
- **Later**: Push via relayer, Soroban, stablecoins, tighter timebounds / offline strategies (see `docs/roadmap.md`).

---

### 8. Implementation plan (reference)

Phased breakdown and file-level guidance: [`docs/webrtc-tap-to-pay.md`](docs/webrtc-tap-to-pay.md) (§ Implementation roadmap + checklist).

This spec supersedes v1.x language that referenced **NFC, BLE, HCE, or Bluetooth** as primary transports; those are **out of scope** for the current product direction.
