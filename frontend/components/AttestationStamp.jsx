"use client";

// The one signature element of this UI: every risk score arrives with a
// physical-stamp-style badge, echoing the ink stamp on a paper insurance
// policy — except what's being certified here is a confidential-compute
// attestation hash, not a signature. Jagged edge via clip-path stands in
// for a stamp's inked, slightly-torn perimeter.
const STAMP_CLIP =
  "polygon(4% 12%,10% 2%,20% 8%,30% 1%,40% 9%,50% 2%,60% 9%,70% 1%,80% 8%,90% 2%,96% 12%,99% 22%,94% 30%,99% 40%,93% 50%,99% 60%,94% 70%,99% 80%,96% 90%,90% 98%,80% 92%,70% 99%,60% 91%,50% 98%,40% 91%,30% 99%,20% 92%,10% 98%,4% 90%,1% 80%,7% 70%,1% 60%,6% 50%,1% 40%,7% 30%,1% 20%)";

export default function AttestationStamp({ isFresh, hash }) {
  const short = hash && hash !== "0x" + "0".repeat(64) ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : null;

  return (
    <div
      className="flex h-24 w-24 shrink-0 flex-col items-center justify-center text-center"
      style={{
        clipPath: STAMP_CLIP,
        transform: "rotate(-6deg)",
        backgroundColor: isFresh ? "#EDEBFF" : "#F1F1F1",
        border: `2px solid ${isFresh ? "#6A5CFF" : "#8A8A8A"}`,
        color: isFresh ? "#6A5CFF" : "#8A8A8A",
      }}
      title={short ? `Attestation hash ${hash}` : "No fresh attestation on file"}
    >
      <span className="font-display text-[9px] font-bold uppercase leading-tight tracking-wider">
        {isFresh ? "TEE" : "NO"}
      </span>
      <span className="font-display text-[9px] font-bold uppercase leading-tight tracking-wider">
        {isFresh ? "Verified" : "Attest."}
      </span>
      {short && <span className="mt-0.5 font-mono text-[7px] leading-none">{short}</span>}
    </div>
  );
}
