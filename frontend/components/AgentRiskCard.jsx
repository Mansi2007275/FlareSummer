"use client";

import AttestationStamp from "./AttestationStamp";
import { riskTier } from "../lib/riskTier";

export default function AgentRiskCard({ agent, onBuyCover }) {
  const tier = riskTier(agent.riskScore);
  const buffer = agent.collateralRatioPct - agent.liquidationThresholdPct;

  return (
    <div className="card-brutal flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-ink/50">FAsset agent</p>
          <h3 className="font-display text-lg font-bold leading-tight">{agent.label}</h3>
          <p className="mt-0.5 break-all font-mono text-[11px] text-ink/50">{agent.address}</p>
        </div>
        <AttestationStamp isFresh={agent.isFresh} hash={agent.attestationHash} />
      </div>

      <div className="flex items-end justify-between border-y-3 border-ink/10 py-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-ink/50">Risk score</p>
          <p className="font-display text-4xl font-bold leading-none" style={{ color: tier.color }}>
            {agent.riskScore}
            <span className="text-lg text-ink/40">/100</span>
          </p>
        </div>
        <span
          className="border-3 border-ink px-2 py-1 font-display text-xs font-bold uppercase tracking-wide"
          style={{ backgroundColor: tier.color, color: tier.key === "safe" ? "#0B2E1B" : "#14110F" }}
        >
          {agent.liquidated ? "Liquidated" : tier.label}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 font-mono text-xs">
        <div>
          <dt className="text-ink/50">Collateral ratio</dt>
          <dd className="text-base font-semibold">{agent.collateralRatioPct.toFixed(1)}%</dd>
        </div>
        <div>
          <dt className="text-ink/50">Liquidation at</dt>
          <dd className="text-base font-semibold">{agent.liquidationThresholdPct.toFixed(1)}%</dd>
        </div>
        <div>
          <dt className="text-ink/50">Buffer above threshold</dt>
          <dd className="text-base font-semibold" style={{ color: buffer < 10 ? "#FF3D6E" : "#14110F" }}>
            {buffer.toFixed(1)} pts
          </dd>
        </div>
        <div>
          <dt className="text-ink/50">Past liquidations</dt>
          <dd className="text-base font-semibold">{agent.liquidationCount}</dd>
        </div>
      </dl>

      <button
        onClick={() => onBuyCover(agent)}
        disabled={agent.liquidated}
        className="btn-brutal focus-ring mt-1 bg-flare px-4 py-3 text-sm text-white disabled:hover:translate-x-0"
      >
        {agent.liquidated ? "Agent already liquidated" : "Buy cover on this agent"}
      </button>
    </div>
  );
}
