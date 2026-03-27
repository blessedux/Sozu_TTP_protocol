export type Network = "TESTNET" | "PUBLIC";

export interface RequestEnvelope {
  merchantAccount: string;
  amount: string;
  asset: string;
  currencyDisplay?: string;
  description?: string;
  sessionNonce: string;
  createdAt: number;
  expiresAt?: number;
  network: Network;
  protocolVersion: string;
  merchantSignature?: string;
}

export function encodeEnvelope(env: RequestEnvelope): string {
  validateEnvelope(env);
  const canonical = {
    merchantAccount: env.merchantAccount,
    amount: env.amount,
    asset: env.asset,
    currencyDisplay: env.currencyDisplay ?? null,
    description: env.description ?? null,
    sessionNonce: env.sessionNonce,
    createdAt: env.createdAt,
    expiresAt: env.expiresAt ?? null,
    network: env.network,
    protocolVersion: env.protocolVersion,
    merchantSignature: env.merchantSignature ?? null
  };
  return JSON.stringify(canonical);
}

export function decodeEnvelope(payload: string): RequestEnvelope {
  let parsed: any;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error("Invalid envelope payload: not valid JSON");
  }

  const env: RequestEnvelope = {
    merchantAccount: parsed.merchantAccount,
    amount: parsed.amount,
    asset: parsed.asset,
    currencyDisplay: parsed.currencyDisplay ?? undefined,
    description: parsed.description ?? undefined,
    sessionNonce: parsed.sessionNonce,
    createdAt: parsed.createdAt,
    expiresAt: parsed.expiresAt ?? undefined,
    network: parsed.network,
    protocolVersion: parsed.protocolVersion,
    merchantSignature: parsed.merchantSignature ?? undefined
  };

  validateEnvelope(env);
  return env;
}

export function validateEnvelope(env: RequestEnvelope): void {
  if (!env.merchantAccount || typeof env.merchantAccount !== "string") {
    throw new Error("merchantAccount is required");
  }
  if (!env.amount || typeof env.amount !== "string") {
    throw new Error("amount is required");
  }
  if (!env.asset || typeof env.asset !== "string") {
    throw new Error("asset is required");
  }
  if (!env.sessionNonce || typeof env.sessionNonce !== "string") {
    throw new Error("sessionNonce is required");
  }
  if (env.sessionNonce.length < 16) {
    throw new Error("sessionNonce too short");
  }
  if (typeof env.createdAt !== "number" || !Number.isFinite(env.createdAt)) {
    throw new Error("createdAt must be a number");
  }
  if (env.expiresAt !== undefined && typeof env.expiresAt !== "number") {
    throw new Error("expiresAt must be a number if set");
  }
  if (env.expiresAt !== undefined && env.expiresAt < env.createdAt) {
    throw new Error("expiresAt must be >= createdAt");
  }
  if (env.network !== "TESTNET" && env.network !== "PUBLIC") {
    throw new Error("network must be TESTNET or PUBLIC");
  }
  if (!env.protocolVersion) {
    throw new Error("protocolVersion is required");
  }
}

