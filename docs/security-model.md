# Security Model (MVP)

## Assets we must protect

- **Private keys**: never leave the payer device.
- **User intent**: payment must require explicit confirmation.
- **Integrity of requests**: prevent silent tampering between request generation and wallet parsing.

## Threats and MVP mitigations

### 1) Stolen phone

- Require local device authentication for signing (biometric/PIN where available).
- Encrypt key material at rest using platform primitives.

### 2) Compromised server / hosted web app

- Keys remain on device; server compromise must not expose user keys.
- Prefer client-side signing; never send secrets over the network.

### 3) Intercepted NFC/QR payload

- Payload is only a request (destination + amount), not a signed transaction.
- Wallet shows the full destination and amount and requires confirmation.

### 4) Request replay

- Include `sessionNonce` and `expiresAt` hints.
- Wallet binds `sessionNonce` into transaction memo and uses short timebounds.
- Merchant tool checks it hasn’t already accepted a tx for that nonce.

### 5) Amount or destination tampering

- Wallet shows user-readable confirmation.
- (Later) optional merchant signatures over request envelopes.

## What the merchant tool must never do

- Construct txs on behalf of users.
- Submit txs on behalf of users.
- Hold payer keys.

This keeps the architecture closer to “verification & display” rather than “processing”.

