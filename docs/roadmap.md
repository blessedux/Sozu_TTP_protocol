# Roadmap

## MVP (now)

- Web-first wallet + merchant request tool (PWA-capable).
- SEP-7 / request envelope generation and parsing.
- QR generation + scanning baseline.
- Wallet builds/signs/submits Stellar XLM payments on testnet.
- Merchant tool verifies on-chain transactions via Horizon read-only.

## Next (after MVP)

- Push confirmation via a minimal relayer (read-only Horizon stream + APNs/FCM).
- NFC tap transport where available:
  - Android: Web NFC (if suitable) or lightweight native wrapper.
  - iOS: entitlement-dependent; do not block MVP on it.
- Offline/single-connected enhancements:
  - cached sequence/fees + tighter timebounds
  - claimable-balance-based flows for small value (optional)

## Later

- Android native HCE for true “tap like Apple Pay” where allowed.
- Soroban integrations (refunds/escrow/loyalty) initiated by wallet only.
- Stablecoins (e.g. USDC) once compliance/anchors are defined.

