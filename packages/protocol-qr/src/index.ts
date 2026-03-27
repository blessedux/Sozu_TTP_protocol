import type { RequestEnvelope } from "@stellartap/protocol-core";
import { encodeEnvelope, decodeEnvelope } from "@stellartap/protocol-core";

export type QrPayload =
  | { kind: "sep7"; sep7Url: string }
  | { kind: "envelope"; envelope: RequestEnvelope };

const STELLARTAP_PREFIX = "stellartap:";
const STELLARTAP_V1 = "v1";

/** Browser + Node (no Buffer): UTF-8 → base64url */
function utf8ToBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** base64url → UTF-8 string */
function base64UrlToUtf8(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeQrPayload(payload: QrPayload): string {
  if (payload.kind === "sep7") {
    // Keep SEP-7 URLs raw when possible for interoperability.
    return payload.sep7Url;
  }

  const envJson = encodeEnvelope(payload.envelope);
  const packed = JSON.stringify({ t: "envelope", p: envJson });
  const encoded = utf8ToBase64Url(packed);
  return `${STELLARTAP_PREFIX}${STELLARTAP_V1}:${encoded}`;
}

export function decodeQrPayload(raw: string): QrPayload {
  const trimmed = raw.trim();

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    // Treat as SEP-7 URL (or future deep link) for MVP.
    return { kind: "sep7", sep7Url: trimmed };
  }

  if (!trimmed.startsWith(`${STELLARTAP_PREFIX}${STELLARTAP_V1}:`)) {
    throw new Error("Unrecognized QR payload");
  }

  const encoded = trimmed.slice(`${STELLARTAP_PREFIX}${STELLARTAP_V1}:`.length);
  const packedJson = base64UrlToUtf8(encoded);
  const packed = JSON.parse(packedJson) as { t: string; p: string };

  if (packed.t !== "envelope") {
    throw new Error("Unsupported QR payload type");
  }

  const envelope = decodeEnvelope(packed.p);
  return { kind: "envelope", envelope };
}

