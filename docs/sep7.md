# SEP-7 (Payment Request Links)

SEP-7 is a Stellar ecosystem standard for expressing payment requests as a URL-like payload that can be shared over **links**, **QR**, or **any byte transport**—including a **WebRTC DataChannel** after a proximity gate.

## Why we use it

- Compact string form for **DataChannel** and QR fallback.
- Interoperable with other wallets.
- Fits a **wallet submits** architecture.

## MVP payload shape

For MVP, we use a *pay* link with at minimum:

- `destination`: merchant Stellar address
- `amount`: decimal string
- `asset_code`: `XLM` (MVP)
- `memo`: an encoded nonce (recommended)

Example:

`https://stellartap.example/pay?destination=G...&amount=10&asset_code=XLM&memo=<nonce>`

## Nonce and matching

To allow the receiver to verify a specific request, include a request nonce:

- in the SEP-7 `memo` (or `memo_hash` if needed), and/or
- inside a request envelope that the wallet converts into memo content deterministically.

## Important MVP constraint

The SEP-7 link is a **request**, not a transaction. The wallet must:

1. Parse request
2. Show user confirmation (exact UX may tighten after tap path)
3. Build/sign/submit the Stellar transaction locally
