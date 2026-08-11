"use client";

import { useEffect, useState } from "react";
import { parseEther, formatEther, parseUnits } from "ethers";
import { getInsurancePool } from "../lib/contracts";
import { riskTier } from "../lib/riskTier";

// Coston2 rejects EIP-1559 transactions below its 500-Gwei fee-cap floor.
const COSTON2_FEE_PER_GAS = parseUnits("700", "gwei");

export default function BuyCoverModal({ agent, wallet, onClose, onPurchased }) {
  const [coverAmount, setCoverAmount] = useState("1");
  const [durationDays, setDurationDays] = useState(30);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [txHash, setTxHash] = useState(null);

  const tier = riskTier(agent.riskScore);

  useEffect(() => {
    let cancelled = false;
    async function quotePremium() {
      setQuoteError(null);
      setQuote(null);
      const amount = Number(coverAmount);
      if (!amount || amount <= 0) return;
      try {
        const pool = getInsurancePool();
        const wei = parseEther(coverAmount);
        const [premium] = await pool.calculatePremium(agent.address, wei, durationDays);
        if (!cancelled) setQuote(formatEther(premium));
      } catch (err) {
        if (!cancelled) setQuoteError("Could not quote a premium for this amount — try a smaller cover amount.");
      }
    }
    const debounce = setTimeout(quotePremium, 300);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
  }, [coverAmount, durationDays, agent.address]);

  async function handleBuy() {
    if (!wallet.address) {
      await wallet.connect();
      return;
    }
    if (!quote) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const signer = await wallet.provider.getSigner();
      const pool = getInsurancePool(signer);
      const wei = parseEther(coverAmount);
      const valueToSend = parseEther((Number(quote) * 1.02).toFixed(18));

      const tx = await pool.buyCover(agent.address, wei, durationDays, {
        value: valueToSend,
        gasLimit: 300000n,
        maxFeePerGas: COSTON2_FEE_PER_GAS,
        maxPriorityFeePerGas: COSTON2_FEE_PER_GAS,
      });
      const receipt = await tx.wait();
      setTxHash(receipt.hash);
      onPurchased?.();
    } catch (err) {
      console.error("Cover purchase failed:", err);
      setSubmitError(err?.shortMessage || err?.message || "Transaction failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="buy-cover-title"
    >
      <div className="card-brutal relative w-full max-w-md bg-paper p-6">
        <button
          onClick={onClose}
          aria-label="Close"
          className="btn-brutal focus-ring absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center bg-canvas text-sm font-bold"
        >
          ✕
        </button>

        {!txHash ? (
          <>
            <p className="font-mono text-[11px] uppercase tracking-widest text-ink/50">New policy</p>
            <h2 id="buy-cover-title" className="font-display text-xl font-bold">
              Cover {agent.label}
            </h2>
            <p
              className="mt-1 inline-block border-3 border-ink px-2 py-0.5 font-display text-xs font-bold uppercase"
              style={{ backgroundColor: tier.color, color: tier.key === "safe" ? "#0B2E1B" : "#14110F" }}
            >
              Risk score {agent.riskScore}/100 — {tier.label}
            </p>

            <div className="mt-5 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-xs uppercase tracking-widest text-ink/60">
                  Cover amount (C2FLR)
                </span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={coverAmount}
                  onChange={(e) => setCoverAmount(e.target.value)}
                  className="focus-ring border-3 border-ink bg-paper-dim px-3 py-2 font-mono text-base"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-xs uppercase tracking-widest text-ink/60">
                  Duration: {durationDays} days
                </span>
                <input
                  type="range"
                  min="1"
                  max="365"
                  value={durationDays}
                  onChange={(e) => setDurationDays(Number(e.target.value))}
                  className="accent-flare"
                />
              </label>

              <div className="border-3 border-dashed border-ink/30 p-4">
                <p className="font-mono text-[11px] uppercase tracking-widest text-ink/50">Premium due</p>
                {quoteError ? (
                  <p className="font-mono text-sm text-danger">{quoteError}</p>
                ) : (
                  <p className="font-display text-2xl font-bold">
                    {quote ? Number(quote).toFixed(5) : "…"}
                    <span className="ml-1 font-mono text-sm text-ink/50">C2FLR</span>
                  </p>
                )}
                <p className="mt-1 font-mono text-[11px] text-ink/50">
                  Priced live from this agent&apos;s current risk score — higher risk means a higher rate.
                </p>
              </div>

              {submitError && <p className="font-mono text-xs text-danger">{submitError}</p>}

              <button
                onClick={handleBuy}
                disabled={submitting || !quote}
                className="btn-brutal focus-ring bg-ink px-4 py-3 text-sm text-canvas disabled:hover:translate-x-0"
              >
                {submitting
                  ? "Confirming in wallet…"
                  : wallet.address
                  ? "Buy cover"
                  : "Connect wallet to buy cover"}
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div
              className="flex h-16 w-16 items-center justify-center border-3 border-ink bg-safe text-2xl"
              style={{ transform: "rotate(-4deg)" }}
              aria-hidden="true"
            >
              ✓
            </div>
            <h2 className="font-display text-xl font-bold">Cover is active</h2>
            <p className="max-w-xs font-mono text-xs text-ink/60">
              If {agent.label}&apos;s liquidation is verified before your policy expires, payout is automatic —
              no claim form to file.
            </p>
            <a
              href={`${process.env.NEXT_PUBLIC_EXPLORER_URL || "https://coston2-explorer.flare.network"}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="btn-brutal focus-ring bg-canvas px-4 py-2 font-mono text-xs"
            >
              View transaction ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
