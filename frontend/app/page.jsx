"use client";

import { useState } from "react";
import Navbar from "../components/Navbar";
import StatusStrip from "../components/StatusStrip";
import AgentRiskCard from "../components/AgentRiskCard";
import BuyCoverModal from "../components/BuyCoverModal";
import Footer from "../components/Footer";
import { useWallet } from "../lib/hooks/useWallet";
import { usePoolData } from "../lib/hooks/usePoolData";
import { isConfigured } from "../lib/config";

const STEPS = [
  {
    n: "01",
    title: "A private model reads the chain",
    body: "The risk agent runs inside confidential compute, pulling each agent's collateral ratio and live FTSO price volatility. The scoring logic never leaves the enclave.",
  },
  {
    n: "02",
    title: "Only the score gets published",
    body: "A 0–100 risk score plus a cryptographic attestation hash lands on-chain — enough for anyone to verify it wasn't altered, not enough to reverse-engineer the model.",
  },
  {
    n: "03",
    title: "Cover is priced and paid automatically",
    body: "Premiums scale with live risk. If a covered agent's liquidation is verified, payout fires without a claims form.",
  },
];

export default function Home() {
  const wallet = useWallet();
  const { agents, poolReserve, totalExposure, xrpPrice, loading, loadError, refresh } = usePoolData();
  const [selectedAgent, setSelectedAgent] = useState(null);

  return (
    <>
      <Navbar
        address={wallet.address}
        connecting={wallet.connecting}
        error={wallet.error}
        onConnect={wallet.connect}
      />

      <main className="mx-auto max-w-6xl px-5 pb-20 pt-10 sm:px-8">
        {/* Hero / thesis */}
        <section className="grid gap-8 sm:grid-cols-[1.3fr,1fr] sm:items-center">
          <div>
            <span className="inline-block border-3 border-ink bg-danger px-2 py-1 font-display text-xs font-bold uppercase tracking-wide">
              Unbacked risk, covered
            </span>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] sm:text-5xl">
              Your FXRP is only as safe as the agent behind it.
            </h1>
            <p className="mt-4 max-w-xl font-body text-base text-ink/70 sm:text-lg">
              FAssets are backed by agents who can quietly drift toward liquidation with no
              warning to holders. FXRP Sentinel prices and pays out cover against that risk,
              scored by a model that stays confidential so it can&apos;t be gamed.
            </p>
          </div>
          <div
            className="card-brutal flex flex-col gap-2 bg-flare-dim p-6"
            style={{ transform: "rotate(1.5deg)" }}
          >
            <p className="font-mono text-[11px] uppercase tracking-widest text-ink/50">
              Why this exists
            </p>
            <p className="font-display text-lg font-bold leading-snug">
              Flare&apos;s own FAssets audit flags oracle and collateral-ratio manipulation as a
              systemic risk to every FXRP holder — not just a single bad agent.
            </p>
          </div>
        </section>

        {/* Live status */}
        <section className="mt-10">
          <StatusStrip
            poolReserve={poolReserve}
            totalExposure={totalExposure}
            xrpPrice={xrpPrice}
            loadError={loadError}
          />
        </section>

        {/* Agents */}
        <section className="mt-12">
          <div className="mb-5 flex items-end justify-between">
            <h2 className="font-display text-2xl font-bold">Agents on watch</h2>
            <button onClick={refresh} className="btn-brutal focus-ring bg-paper px-3 py-1.5 font-mono text-xs">
              Refresh
            </button>
          </div>

          {!isConfigured ? (
            <div className="card-brutal p-8 text-center">
              <p className="font-display text-lg font-bold">Contracts not configured yet</p>
              <p className="mx-auto mt-2 max-w-md font-mono text-xs text-ink/60">
                Set NEXT_PUBLIC_INSURANCE_POOL_ADDRESS, NEXT_PUBLIC_RISK_ORACLE_ADDRESS,
                NEXT_PUBLIC_FTSO_CONSUMER_ADDRESS and NEXT_PUBLIC_AGENT_ADDRESSES in
                frontend/.env using the addresses printed by the deploy script.
              </p>
            </div>
          ) : loading ? (
            <div className="card-brutal p-8 text-center font-mono text-sm text-ink/60">
              Reading agents from chain…
            </div>
          ) : agents.length === 0 ? (
            <div className="card-brutal p-8 text-center font-mono text-sm text-ink/60">
              No agents configured. Add addresses to NEXT_PUBLIC_AGENT_ADDRESSES.
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              {agents.map((agent) => (
                <AgentRiskCard key={agent.address} agent={agent} onBuyCover={setSelectedAgent} />
              ))}
            </div>
          )}
        </section>

        {/* How it works — a real 3-step sequence, so numbering earns its place here */}
        <section className="mt-16">
          <h2 className="font-display text-2xl font-bold">How a policy gets priced and paid</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.n} className="card-brutal p-5">
                <p className="font-display text-3xl font-bold text-flare">{step.n}</p>
                <p className="mt-2 font-display text-base font-bold leading-snug">{step.title}</p>
                <p className="mt-2 font-body text-sm text-ink/65">{step.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <Footer />

      {selectedAgent && (
        <BuyCoverModal
          agent={selectedAgent}
          wallet={wallet}
          onClose={() => setSelectedAgent(null)}
          onPurchased={refresh}
        />
      )}
    </>
  );
}
