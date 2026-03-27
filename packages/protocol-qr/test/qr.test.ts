import { describe, it, expect } from "vitest";
import type { RequestEnvelope } from "@stellartap/protocol-core";
import { encodeQrPayload, decodeQrPayload } from "../src/index";

function sampleEnvelope(): RequestEnvelope {
  const now = Math.floor(Date.now() / 1000);
  return {
    merchantAccount: "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    amount: "10",
    asset: "XLM",
    sessionNonce: "abcd1234efgh5678",
    createdAt: now,
    network: "TESTNET",
    protocolVersion: "1.0.0"
  };
}

describe("protocol-qr", () => {
  it("roundtrips an envelope QR payload", () => {
    const env = sampleEnvelope();
    const encoded = encodeQrPayload({ kind: "envelope", envelope: env });
    const decoded = decodeQrPayload(encoded);
    expect(decoded.kind).toBe("envelope");
    if (decoded.kind === "envelope") {
      expect(decoded.envelope).toEqual(env);
    }
  });

  it("passes through http(s) payloads as sep7 kind", () => {
    const url =
      "https://stellartap.example/pay?destination=GDEST&amount=1&asset_code=XLM";
    const encoded = encodeQrPayload({ kind: "sep7", sep7Url: url });
    expect(encoded).toBe(url);
    const decoded = decodeQrPayload(encoded);
    expect(decoded).toEqual({ kind: "sep7", sep7Url: url });
  });
});

