# StellarTap Overview (Plain English)

StellarTap is a **peer-to-peer value exchange protocol + self-custodial tools** that let two people (or a customer and a merchant) complete a Stellar payment with a **tap (NFC)** or **scan (QR)**.

## The big picture

Imagine you owe someone money. Instead of using card rails or bank transfers, you:

1. Tap phones (or scan a QR code)
2. Confirm on your own device (biometric / PIN where available)
3. Your wallet signs and submits a Stellar transaction
4. Both sides see the transaction confirmed on-chain

## Core principles

- **Self-custodial**: private keys never leave the user’s device.
- **Wallet submits**: only the payer wallet constructs/signs/submits the Stellar transaction.
- **Merchant tool is non-transactional**: it only generates requests and verifies chain state.
- **Transport-agnostic**: the same request can be carried via NFC, QR, or BLE.
- **Open protocol stance**: the protocol can be published independently of any single app.

## Why SEP-7 matters

SEP-7 gives us a widely understood “payment request language” that can be encoded into:

- a **QR code** (universal)
- an **NFC payload** (where available)
- a **link** that can be shared

The wallet reads the request and builds the payment transaction locally.

