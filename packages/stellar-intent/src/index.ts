import type { RequestEnvelope } from "@stellartap/protocol-core";

export interface TxTimebounds {
  minTime: number;
  maxTime: number;
}

export interface TxBlueprint {
  sourceAccount: string;
  destination: string;
  amount: string;
  asset: string;
  networkPassphrase: string;
  memo: string | null;
  timebounds: TxTimebounds;
}

export interface IntentOptions {
  networkPassphrasePublic: string;
  networkPassphraseTestnet: string;
  defaultTtlSeconds?: number;
}

export function envelopeToBlueprint(
  env: RequestEnvelope,
  payerAccount: string,
  opts: IntentOptions
): TxBlueprint {
  const now = Math.floor(Date.now() / 1000);
  const ttl = opts.defaultTtlSeconds ?? 300;
  // Avoid tx_too_early errors from local clock skew.
  // The wallet still constrains validity using maxTime.
  const minTime = 0;
  const maxTime = now + ttl;

  const networkPassphrase =
    env.network === "PUBLIC"
      ? opts.networkPassphrasePublic
      : opts.networkPassphraseTestnet;

  const memoPayload = {
    n: env.sessionNonce,
    v: env.protocolVersion
  };
  const memoJson = JSON.stringify(memoPayload);
  const bytes = new TextEncoder().encode(memoJson);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const memo = btoa(binary);

  return {
    sourceAccount: payerAccount,
    destination: env.merchantAccount,
    amount: env.amount,
    asset: env.asset,
    networkPassphrase,
    memo,
    timebounds: { minTime, maxTime }
  };
}

