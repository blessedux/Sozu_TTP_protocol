# Roadmap

## Done (primitive MVP)

- Web-first wallet + merchant request tool (PWA-capable).
- SEP-7 / request envelope generation and parsing.
- **QR + paste** transport baseline (universal fallback forever).
- Wallet builds/signs/submits Stellar XLM payments on testnet.
- Merchant tool verifies on-chain transactions via Horizon (read-only).
- Shared packages: `protocol-core`, `protocol-qr`, `stellar-intent`.

## Next — WebRTC “tap to pay” (primary UX)

Aligned with [`webrtc-tap-to-pay.md`](webrtc-tap-to-pay.md):

1. **Signaling service**: Express + Socket.io; `active_requests` with **~90s TTL**; rooms per `requestId`; rate limits.
2. **Username-based discovery**: payer subscribes to live request list; receiver registers on create.
3. **WebRTC**: `RTCPeerConnection` + reliable **DataChannel**; STUN/TURN for mobile networks.
4. **Proximity gate**: ping/pong RTT on DataChannel; threshold (~80 ms start, tunable); “move closer” UX above ~150 ms.
5. **Payload**: full **SEP-0007** (or envelope) over channel after gate → reuse existing wallet parse/sign/submit.
6. **Confirmation**: tx hash (optional) on channel + existing Horizon verification on receiver.
7. **Polish**: haptics, confetti, PWA install path; `wakeLock` where useful on iOS.
8. **Testing**: cross-matrix **iOS Safari ↔ Android Chrome**.

## Then

- **Push**: extend or complement with minimal relayer (Horizon stream + APNs/FCM)—still no tx submission.
- **Offline / resilience**: cached sequence/fees + tighter timebounds; optional claimable-balance flows for small value.

## Later

- Soroban (refunds/escrow/loyalty) initiated by wallet only.
- Stablecoins (e.g. USDC) once compliance/anchors are defined.

**Removed from plan (superseded):** NFC, BLE, Web Bluetooth, Android HCE as tap transports—they are intentionally **out of scope** for the WebRTC-first direction (see `StellarTap_architecture_spec.md`).
