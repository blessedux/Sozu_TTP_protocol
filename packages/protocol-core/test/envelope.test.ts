import { describe, it, expect } from "vitest";
import { RequestEnvelope, encodeEnvelope, decodeEnvelope } from "../src/index";

function sampleEnvelope(): RequestEnvelope {
  const now = Math.floor(Date.now() / 1000);
  return {
    merchantAccount: "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    amount: "10.5",
    asset: "XLM",
    currencyDisplay: "XLM",
    description: "Test payment",
    sessionNonce: "abcd1234efgh5678",
    createdAt: now,
    expiresAt: now + 300,
    network: "TESTNET",
    protocolVersion: "1.0.0"
  };
}

describe("RequestEnvelope encode/decode", () => {
  it("roundtrips a valid envelope", () => {
    const env = sampleEnvelope();
    const payload = encodeEnvelope(env);
    const decoded = decodeEnvelope(payload);
    expect(decoded).toEqual(env);
  });

  it("throws on invalid JSON", () => {
    expect(() => decodeEnvelope("not-json")).toThrow();
  });

  it("rejects envelopes with invalid fields", () => {
    const env = sampleEnvelope();
    // @ts-expect-error testing invalid value
    env.network = "OTHER";
    expect(() => encodeEnvelope(env as any)).toThrow();
  });
});

