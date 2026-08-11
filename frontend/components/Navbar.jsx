"use client";

export default function Navbar({ address, connecting, error, onConnect }) {
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;

  return (
    <header className="border-b-3 border-ink bg-canvas">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center border-3 border-ink bg-ink text-canvas shadow-brutal-sm"
            style={{ transform: "rotate(-4deg)" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2 3 6v6c0 5 3.8 8.7 9 10 5.2-1.3 9-5 9-10V6l-9-4Z"
                fill="#FFE370"
                stroke="#FFE370"
                strokeWidth="1"
              />
            </svg>
          </div>
          <div className="leading-none">
            <p className="font-display text-lg font-bold tracking-tight sm:text-xl">FXRP SENTINEL</p>
            <p className="font-mono text-[11px] uppercase tracking-widest text-ink/60">
              Flare FAssets cover desk
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <button
            onClick={onConnect}
            disabled={connecting || Boolean(address)}
            className="btn-brutal focus-ring bg-ink px-4 py-2 text-sm text-canvas disabled:hover:translate-x-0"
          >
            {address ? short : connecting ? "Connecting…" : "Connect wallet"}
          </button>
          {error && <p className="max-w-[220px] text-right font-mono text-[11px] text-danger">{error}</p>}
        </div>
      </div>
    </header>
  );
}
