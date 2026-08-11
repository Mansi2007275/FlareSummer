export const CHAIN = {
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 114),
  idHex: process.env.NEXT_PUBLIC_CHAIN_ID_HEX || "0x72",
  name: process.env.NEXT_PUBLIC_CHAIN_NAME || "Flare Testnet Coston2",
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://coston2-api.flare.network/ext/C/rpc",
  explorerUrl: process.env.NEXT_PUBLIC_EXPLORER_URL || "https://coston2-explorer.flare.network",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
};

export const ADDRESSES = {
  insurancePool: process.env.NEXT_PUBLIC_INSURANCE_POOL_ADDRESS || "",
  riskOracle: process.env.NEXT_PUBLIC_RISK_ORACLE_ADDRESS || "",
  ftsoConsumer: process.env.NEXT_PUBLIC_FTSO_CONSUMER_ADDRESS || "",
};

export const AGENT_ADDRESSES = (process.env.NEXT_PUBLIC_AGENT_ADDRESSES || "")
  .split(",")
  .map((a) => a.trim())
  .filter(Boolean);

export const isConfigured =
  Boolean(ADDRESSES.insurancePool) && Boolean(ADDRESSES.riskOracle) && AGENT_ADDRESSES.length > 0;
