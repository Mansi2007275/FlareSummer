"use client";

function Stat({ label, value, suffix }) {
  return (
    <div className="flex flex-1 flex-col gap-1 border-ink px-5 py-4 sm:border-l-3 first:border-l-0">
      <span className="font-mono text-[11px] uppercase tracking-widest text-ink/60">{label}</span>
      <span className="font-display text-2xl font-bold tabular-nums sm:text-3xl">
        {value}
        {suffix && <span className="ml-1 font-mono text-sm font-medium text-ink/60">{suffix}</span>}
      </span>
    </div>
  );
}

export default function StatusStrip({ poolReserve, totalExposure, xrpPrice, loadError }) {
  const fmt = (v) => (v === null || v === undefined ? "—" : Number(v).toFixed(2));

  return (
    <div className="card-brutal flex flex-col divide-y-3 divide-ink sm:flex-row sm:divide-x-3 sm:divide-y-0">
      <div className="flex items-center gap-2 px-5 py-4 sm:w-56">
        <span
          className="h-2.5 w-2.5 rounded-full bg-safe animate-blink"
          aria-hidden="true"
        />
        <span className="font-mono text-[11px] uppercase tracking-widest text-ink/70">
          {loadError ? "Reading chain — retrying" : "Live from Coston2"}
        </span>
      </div>
      <Stat label="Pool reserve" value={fmt(poolReserve)} suffix="C2FLR" />
      <Stat label="Active exposure" value={fmt(totalExposure)} suffix="C2FLR" />
      <Stat label="XRP / USD (FTSO)" value={xrpPrice ? xrpPrice.toFixed(4) : "—"} suffix="USD" />
    </div>
  );
}
