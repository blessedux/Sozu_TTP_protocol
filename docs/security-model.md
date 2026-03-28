# Security Model (MVP + WebRTC tap)

## Assets we must protect

- **Private keys**: never leave the payer device.
- **User intent**: payment must require explicit user action (open Pay nearby, tap a card—no silent acceptance).
- **Integrity of requests**: prevent tampering between request generation and wallet parsing.

## Threats and mitigations

### 1) Stolen phone

- Require local device authentication for signing (biometric/PIN where available).
- Encrypt key material at rest using platform primitives.

### 2) Compromised server / hosted web app

- Keys remain on device; server compromise must not expose user keys.
- Client-side signing only; never send private keys over the network.

### 3) Intercepted request payload (QR, paste, or DataChannel)

- Payload is only a **request** (destination + amount + binding memo hints), not a signed transaction.
- Wallet shows human-readable confirmation (policy may reduce steps after verified tap path).

### 4) Signaling server abuse

- **Rate limit** WebSocket connections and registrations per IP / username.
- **Short TTL** on active requests (e.g. 90s).
- Do not persist full SEP-7 on server if a stub + post-handshake channel delivery model is used.

### 5) WebRTC / MITM concerns

- User media/data is **DTLS-protected** between peers; validate **session binding** to `requestId` / identity rules so payers don’t accept arbitrary peers.
- Use **TURN** with authentication in production; monitor for unexpected ICE patterns.

### 6) Proximity gate bypass

- RTT-only gating is **heuristic** (not cryptographically “true distance”). Combine with **short TTL**, **memo-bound** txs, and **user tap** on the correct request card.
- Document that remote attackers on same LAN with very low RTT could theoretically pass—mitigate with pairing secrets later if needed.

### 7) Request replay

- `sessionNonce` / `expiresAt`; wallet uses timebounds and memo binding.
- Receiver treats each nonce as single-use for “paid” UI.

### 8) Amount or destination tampering

- Wallet shows confirmation fields parsed from SEP-7.
- (Later) optional signed envelopes.

## What the receiver / merchant tool must never do

- Construct txs on behalf of payers.
- Submit txs on behalf of payers.
- Hold payer keys.

This keeps the architecture closer to “verification & display” rather than “processing.”
