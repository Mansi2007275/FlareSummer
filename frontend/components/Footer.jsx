export default function Footer() {
  return (
    <footer className="mt-16 border-t-3 border-ink bg-ink text-canvas">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="font-mono text-[11px] uppercase tracking-widest">
          FXRP Sentinel — built on Flare (FTSO · FDC · FCC)
        </p>
        <p className="font-mono text-[11px] text-canvas/60">
          Demo build on Coston2 testnet. Not financial advice, not audited.
        </p>
      </div>
    </footer>
  );
}
