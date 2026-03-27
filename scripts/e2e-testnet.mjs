import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder
} from "@stellar/stellar-sdk";

const HORIZON = process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const FRIENDBOT = process.env.FRIENDBOT_URL ?? "https://friendbot.stellar.org";
const AMOUNT = process.env.AMOUNT ?? "1";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function randomNonceHex(bytes = 16) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function decimalToStroops(amount) {
  const s = String(amount).trim();
  if (!s) throw new Error("amount is empty");
  if (s.startsWith("-")) throw new Error("amount must be positive");
  const [wholeRaw, fracRaw = ""] = s.split(".");
  const whole = wholeRaw === "" ? "0" : wholeRaw;
  const frac = (fracRaw + "0000000").slice(0, 7);
  if (!/^\d+$/.test(whole) || !/^\d{7}$/.test(frac)) {
    throw new Error("amount is not a valid decimal");
  }
  return BigInt(whole) * 10000000n + BigInt(frac);
}

async function friendbotFund(pub) {
  const res = await fetch(`${FRIENDBOT}?addr=${encodeURIComponent(pub)}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Friendbot failed ${res.status}: ${text}`);
  }
}

async function loadNativeBalance(server, pub) {
  const acct = await server.loadAccount(pub);
  const bal = acct.balances.find((b) => b.asset_type === "native");
  return bal?.balance ?? "0";
}

async function submitPayment({ server, payerKp, destPub, memoText, amount }) {
  const payerPub = payerKp.publicKey();
  const payerAcct = await server.loadAccount(payerPub);

  const tx = new TransactionBuilder(payerAcct, {
    fee: String(BASE_FEE),
    networkPassphrase: Networks.TESTNET,
    timebounds: { minTime: 0, maxTime: nowSec() + 300 }
  })
    .addOperation(
      Operation.payment({
        destination: destPub,
        asset: Asset.native(),
        amount
      })
    )
    .addMemo(Memo.text(memoText))
    .build();

  tx.sign(payerKp);
  const res = await server.submitTransaction(tx);
  return res.hash;
}

async function pollMerchantDetect({ server, merchantPub, amount, memoNeedle, timeoutMs = 30_000 }) {
  const start = Date.now();
  const want = decimalToStroops(amount);
  while (Date.now() - start < timeoutMs) {
    const payments = await server
      .payments()
      .forAccount(merchantPub)
      .order("desc")
      .limit(10)
      .call();

    for (const r of payments.records) {
      if (r.type !== "payment") continue;
      if (decimalToStroops(r.amount) !== want) continue;

      const tx = await server.transactions().transaction(r.transaction_hash).call();
      const memo = tx.memo_type === "none" ? null : tx.memo;
      if (memo && String(memo).includes(memoNeedle)) {
        return { txHash: r.transaction_hash, memo };
      }
    }

    await sleep(2000);
  }
  return null;
}

async function main() {
  const server = new Horizon.Server(HORIZON);

  const merchantKp = Keypair.random();
  const payerKp = Keypair.random();

  const nonce = randomNonceHex(16);
  const nonceShort = nonce.slice(0, 24);
  const memoText = `st:${nonceShort}`; // mirrors wallet-web and merchant-web matching

  console.log("[e2e] horizon:", HORIZON);
  console.log("[e2e] merchant:", merchantKp.publicKey());
  console.log("[e2e] payer:", payerKp.publicKey());
  console.log("[e2e] amount:", AMOUNT);
  console.log("[e2e] memo:", memoText);

  console.log("[e2e] funding merchant via friendbot…");
  await friendbotFund(merchantKp.publicKey());
  // Give the network a moment to close the ledger containing account creation.
  await sleep(3000);

  console.log("[e2e] funding payer via friendbot…");
  await friendbotFund(payerKp.publicKey());
  await sleep(3000);

  const payerBal = await loadNativeBalance(server, payerKp.publicKey());
  const merchantBal = await loadNativeBalance(server, merchantKp.publicKey());
  console.log("[e2e] balances before:", { payerBal, merchantBal });

  console.log("[e2e] submitting payment tx (wallet submits) …");
  let txHash;
  try {
    txHash = await submitPayment({
      server,
      payerKp,
      destPub: merchantKp.publicKey(),
      memoText,
      amount: AMOUNT
    });
    console.log("[e2e] submitted tx hash:", txHash);
  } catch (e) {
    const extras = e?.response?.data?.extras;
    if (extras) {
      console.error("[e2e] submit failed extras:", JSON.stringify(extras, null, 2));
    }
    throw e;
  }

  console.log("[e2e] waiting for merchant detection via Horizon…");
  const detected = await pollMerchantDetect({
    server,
    merchantPub: merchantKp.publicKey(),
    amount: AMOUNT,
    memoNeedle: memoText,
    timeoutMs: 45_000
  });

  if (!detected) {
    console.error("[e2e] FAILED: did not detect matching payment in time.");
    process.exitCode = 1;
    return;
  }

  const payerBalAfter = await loadNativeBalance(server, payerKp.publicKey());
  const merchantBalAfter = await loadNativeBalance(server, merchantKp.publicKey());
  console.log("[e2e] detected:", detected);
  console.log("[e2e] balances after:", { payerBalAfter, merchantBalAfter });
  console.log("[e2e] SUCCESS");
}

main().catch((e) => {
  console.error("[e2e] ERROR:", e);
  process.exitCode = 1;
});

