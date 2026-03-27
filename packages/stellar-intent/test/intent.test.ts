import { describe, it, expect } from "vitest";
import type { RequestEnvelope } from "@stellartap/protocol-core";
import { envelopeToBlueprint } from "../src/index";

function sampleEnvelope(): RequestEnvelope {
  const now = Math.floor(Date.now() / 1000);
  return {
    merchantAccount: "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    amount: "5.0",
    asset: "XLM",
    currencyDisplay: "XLM",
    description: "Coffee",
    sessionNonce: "abcd1234efgh5678",
    createdAt: now,
    expiresAt: now + 600,
    network: "TESTNET",
    protocolVersion: "1.0.0"
  };
}

describe("envelopeToBlueprint", () => {
  it("produces a blueprint with correct core fields", () => {
    const env = sampleEnvelope();
    const bp = envelopeToBlueprint(env, "GPAYERACCOUNTXXXXXXXXXXXXXXXXXXXXXXXXXXXX", {
      networkPassphrasePublic: "Public Global Stellar Network ; September 2015",
      networkPassphraseTestnet: "Test SDF Network ; September 2015"
    });

    expect(bp.sourceAccount).toBe(
      "GPAYERACCOUNTXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
    );
    expect(bp.destination).toBe(env.merchantAccount);
    expect(bp.amount).toBe(env.amount);
    expect(bp.asset).toBe(env.asset);
    expect(bp.networkPassphrase).toBe(
      "Test SDF Network ; September 2015"
    );
    expect(bp.timebounds.maxTime).toBeGreaterThan(bp.timebounds.minTime);
    expect(typeof bp.memo).toBe("string");
  });
});

