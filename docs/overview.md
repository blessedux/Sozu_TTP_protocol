# StellarTap Overview (Plain English)

StellarTap is a **peer-to-peer value exchange protocol + self-custodial tools** that let two people (or a customer and a merchant) complete a Stellar payment with a **tap-like UX** (target: **WebRTC** between two phones) or, when needed, **scan/copy (QR)**.

## The big picture

Imagine you owe someone money. Instead of card rails or bank transfers, you:

1. Receiver creates a request; payer sees it **nearby** and taps to connect (**WebRTC**), or uses **QR** as fallback.
2. Phones are **close enough** (proximity approximated by **round-trip time** on an encrypted data channel—not NFC or Bluetooth).
3. The payer’s wallet shows the request and (per product policy) confirms or auto-proceeds after the tap path.
4. The wallet **signs and submits** a Stellar transaction.
5. Both sides see confirmation (on-screen; push optional later).

## Core principles

- **Self-custodial**: private keys never leave the user’s device.
- **Wallet submits**: only the payer wallet constructs/signs/submits the Stellar transaction.
- **Receiver tool is non-transactional**: it only generates requests and verifies chain state.
- **Transport-agnostic requests**: the same **SEP-7 / envelope** can move over **DataChannel**, **QR**, or **link**—semantics stay identical.
- **No NFC / no Bluetooth** in the current architecture plan; **WebRTC + signaling** is the primary tap story.
- **Open protocol stance**: the protocol can be published independently of any single app.

## Why SEP-7 matters

SEP-7 gives a standard “payment request language” that can be encoded into:

- bytes on a **WebRTC DataChannel**
- a **QR code** (fallback and debugging)
- a **link** for messaging

The wallet parses the request and builds the payment transaction locally.
