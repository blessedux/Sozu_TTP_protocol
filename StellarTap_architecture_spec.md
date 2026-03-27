**StellarTap Architecture Specification**  
**Version:** 1.1 (Web-first + CMF-safe flow)  
**Date:** March 26, 2026  
**Project Goal:** Build an open-protocol, self-custodial tap-to-pay system on the Stellar blockchain that turns any modern smartphone into a tap-to-pay experience, while remaining independent of closed-source payment gatekeepers (Apple Pay / Google Pay / card rails) and minimizing regulator-triggering “payment service provider” semantics.

This spec prioritizes **decentralized freedom** while being realistic about 2026 platform constraints.

### 1. Non-Negotiables (Immutable Principles)

These cannot be compromised under any circumstances:

- **Stellar-only settlement**: Every transaction must be a native Stellar payment operation (or Soroban smart contract for advanced features like escrows/refunds). No bridging to Visa, Mastercard, or any legacy rail.
- **Protocol-first transport**: NFC/QR/BLE are transports for *payment requests*, not a “processing rail”. Only the minimal data needed to build a user-signed Stellar transaction is exchanged. No reliance on Apple/Google tokenization.
- **Zero dependency on closed-source gatekeepers for core functionality**:
  - Android: Pure HCE (Host Card Emulation) – no Google Pay required.
  - iOS: Prefer HCE where available (EEA); fall back to NFC & SE Platform only if entitlement is granted without forcing Apple Pay integration. If Apple blocks pure crypto use, iOS becomes secondary with QR/BLE fallback.
- **Regular smartphones only**: No extra hardware for merchants. Any NFC-equipped phone (Android 10+ or iPhone XS+) becomes a full POS.
- **Identical Apple Pay UX**: Tap → biometric (Face ID / fingerprint / passcode) → instant on-chain confirmation + push notification in <5 seconds.
- **Phone-to-phone + NFC card-to-phone support**: Both directions must work seamlessly.
- **Human-right-to-transact ethos**: Open-source the protocol spec (not necessarily the full wallet code). No KYC/AML baked into the protocol itself (handle at app/anchor level per jurisdiction). Anti-monopoly by design – zero fees to Apple/Visa.
- **Security first**: All signing happens in Secure Enclave (iOS) or StrongBox/TEE (Android). No private keys ever leave the device.
- **Offline-first capable**: Small-value transactions can use claimable balances or later reconciliation.
- **CMF-safe execution model (Chile-optimized)**: The merchant-side tool must not construct, sign, or submit transactions. The payer wallet constructs/signs/submits directly to the Stellar network. Merchant-side only generates requests and verifies on-chain state.

### 2. Desired Outcome Flow (Exact User Experience)

The end-to-end flow must feel **magical and identical to Apple Pay** for both payer and merchant.

**Merchant (Request Tool) Flow**:

1. Open StellarTap merchant request interface (initially a web app; native wrappers optional later).
2. Enter amount (or use quick-select buttons / product catalog).
3. Tap “Request” → merchant device displays request via **QR** and/or broadcasts via **NFC/BLE** when available.
4. Customer taps phones (NFC) or scans QR.
5. Merchant screen shows: “**Transaction detected on Stellar**” (no guarantee language).
6. Push notification + optional receipt with transaction hash / explorer link.
7. Optional: Auto-issue loyalty token or trigger Soroban smart contract (refund policy, etc.).

**Payer (Wallet) Flow (Web-first)**:

1. Open StellarTap Wallet in a browser (PWA-capable); no app store required for MVP.
2. Tap phone-to-phone (NFC) or scan QR.
4. Biometric prompt (exact same as Apple Pay double-click flow where possible).
5. Wallet constructs, signs, and submits the Stellar transaction directly → “Sent” with tx hash.
6. Optional loyalty asset or memo auto-applied.

**NFC Card Variant**:

- Users can buy/issue cheap physical Stellar NFC cards/tags (or use existing Tangem-style cards).
- POS phone reads them in reader mode → same flow as phone-to-phone.

**Fallbacks (for maximum reach)**:

- Dynamic QR code (camera-to-camera).
- BLE proximity pairing + data-over-sound as “virtual tap”.

**Success Metric**: 95% of users say the experience is “as easy or easier than Apple Pay” in testing.

### 3. High-Level Architecture

- **Two Interfaces, One Protocol**:
  - **Wallet** (payer): Self-custodial. Constructs + signs + submits Stellar transactions directly. Never exports private keys.
  - **Merchant Request Tool**: Generates payment requests and verifies on-chain outcomes. Never constructs/signs/submits user transactions.
- **Protocol (Request Envelope)**:
  - Transport-agnostic request envelope sent over NFC/QR/BLE.
  - Wallet converts envelope → signed Stellar tx (with memo binding to nonce) → submits directly to Horizon.
  - Merchant verifies by reading Horizon and matching the request nonce in memo.
- **Optional: SEP-7 compatibility**:
  - Represent request envelopes as SEP-7-style URIs for interoperability and simplicity.
  - QR codes can carry SEP-7 links; NFC can carry the same payload.
- **Stellar Layer**:
  - Use Stellar Wallet SDK (Kotlin/Flutter/Swift) for account management, signing, and on/off-ramps.
  - Optional Soroban for merchant-specific logic (escrow, refunds, loyalty issuance).
- **Cross-Platform**:
  - Shared protocol library (Rust or Kotlin Multiplatform recommended).
  - Flutter or React Native for rapid MVP (with native NFC modules).

### 4. Platform-Specific Implementation

| Platform    | NFC Approach                                   | Default Contactless Flow                          | Notes (2026 Reality)                                                                                                  |
| ----------- | ---------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Android** | HCE + custom HostApduService                   | Full control                                      | Primary target. Fully open, no approvals needed.                                                                      |
| **iOS**     | HCE (EEA) or NFC & SE Platform (rest of world) | Double-click side button (if entitlement granted) | Commercial agreement + fees required outside EEA. Crypto payments may need PSP partnership. If blocked → QR fallback. |

### 5. Tech Stack (Recommended)

- **Web (MVP)**: PWA/web wallet + merchant request tool (same codebase, different modes).
- **Stellar**: Stellar SDK for transaction building/signing and Horizon submission (web-first; native SDKs optional later).
- **NFC**:
  - Android: `android.nfc.cardemulation` + custom APDU.
  - iOS: NFC & SE APIs (or HCE where available).
- **Security**: Biometrics + Secure Enclave/StrongBox; passkeys for account recovery.
- **Backend (optional)**: Minimal – only for analytics, push notifications, and anchor on/off-ramps. Core tx flow is P2P on-chain.

### 6. Security, Compliance & Risks

- **Security**: Relay-attack mitigations (timestamps + nonces); on-device only signing.
- **Compliance**: Start with P2P / stablecoin focus. Add KYC/AML at anchor level per country. Consult fintech lawyer before launch.
- **Risks & Mitigations**:
  - Apple entitlement denial → Android-first MVP + iOS QR/BLE.
  - Regulatory pushback → “Protocol open-source, app is just UI” positioning.
  - Adoption → Zero-fee incentive + emerging-market focus (street vendors, remittances).

### 7. MVP Scope (Phase 1 – 6–8 weeks)

- Web-first (Wallet + Merchant Request Tool) with QR as the universal baseline.
- Optional NFC tap where available (Android Web NFC / native wrappers later).
- Basic Stellar XLM payments end-to-end.
- Biometric auth when available (WebAuthn/passkeys optional; device auth via platform where possible).
- Testnet → mainnet toggle.
- Open protocol spec + request envelope format on Day 1.

This spec is ready to hand directly to your planner agent or dev team. It captures the vision, the hard lines, and the exact user outcome you want.

If you want any section expanded (e.g., full protocol APDU spec, wireframes, or Soroban examples), or if we should adjust non-negotiables based on new details (target regions, stablecoin focus, etc.), just say the word and I’ll iterate instantly.

Let’s build the first truly open tap-to-pay system the world has ever seen. 🚀
