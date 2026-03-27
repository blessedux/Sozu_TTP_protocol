# Protocol: Request Envelope

This document defines a minimal, transport-agnostic “request envelope” used to request a payment from a wallet.

## Goals

- Work over **QR**, **NFC**, or **BLE** without changing semantics.
- Contain only the minimum information needed to build a Stellar payment.
- Support request matching on-chain via **memo nonce**.

## Envelope fields (MVP)

- `merchantAccount` (string): Stellar address (G...).
- `amount` (string): decimal string (e.g. `"10"`, `"10.5"`).
- `asset` (string): `"XLM"` for MVP.
- `currencyDisplay` (string, optional): UI hint.
- `description` (string, optional): payee label or note.
- `sessionNonce` (string): random nonce, at least 128-bit entropy (e.g. 16+ bytes encoded).
- `createdAt` (number): unix time seconds.
- `expiresAt` (number, optional): unix time seconds.
- `network` (`TESTNET` | `PUBLIC`): intended network.
- `protocolVersion` (string): e.g. `"1.0.0"`.
- `merchantSignature` (string, optional): future feature.

## Encoding

MVP encoding is **canonical JSON** with stable key order and explicit `null` for absent optional keys.

## How the wallet uses it

Wallet builds a Stellar transaction with:

- destination = `merchantAccount`
- amount/asset = `amount`/`asset`
- memo = a deterministic encoding containing `sessionNonce` (so the merchant tool can match it)
- timebounds = short validity window

## How the merchant tool verifies it

Merchant tool reads Horizon and looks for a confirmed payment matching:

- destination == `merchantAccount`
- amount/asset match
- memo includes `sessionNonce`

