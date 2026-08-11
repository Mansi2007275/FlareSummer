export function riskTier(score) {
  if (score >= 70) return { key: "danger", label: "High risk", color: "#FF3D6E" };
  if (score >= 35) return { key: "watch", label: "Watch", color: "#FF8A3D" };
  return { key: "safe", label: "Safe", color: "#0F9D58" };
}
