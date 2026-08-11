"use client";

import { useEffect, useState, useCallback } from "react";
import { formatEther } from "ethers";
import { AGENT_ADDRESSES, isConfigured } from "../config";
import { getInsurancePool, getRiskOracle, getMockAgent, getFtsoConsumer } from "../contracts";

const POLL_MS = 15000;

async function loadAgent(address) {
  const agent = getMockAgent(address);
  const riskOracle = getRiskOracle();

  const [label, collateralRatioBP, liquidationThresholdBP, liquidated, liquidationCount, riskData] =
    await Promise.all([
      agent.label(),
      agent.collateralRatioBP(),
      agent.liquidationThresholdBP(),
      agent.liquidated(),
      agent.liquidationCount(),
      riskOracle.getRiskData(address),
    ]);

  return {
    address,
    label,
    collateralRatioPct: Number(collateralRatioBP) / 100,
    liquidationThresholdPct: Number(liquidationThresholdBP) / 100,
    liquidated,
    liquidationCount: Number(liquidationCount),
    riskScore: Number(riskData.score),
    attestationHash: riskData.attestationHash,
    isFresh: riskData.isFresh,
    updatedAt: Number(riskData.updatedAt),
  };
}

export function usePoolData() {
  const [agents, setAgents] = useState([]);
  const [poolReserve, setPoolReserve] = useState(null);
  const [totalExposure, setTotalExposure] = useState(null);
  const [xrpPrice, setXrpPrice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const refresh = useCallback(async () => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }
    try {
      const pool = getInsurancePool();
      const ftso = getFtsoConsumer();

      const [reserve, exposure, agentResults] = await Promise.all([
        pool.poolReserve(),
        pool.totalActiveExposure(),
        Promise.all(AGENT_ADDRESSES.map(loadAgent)),
      ]);

      setPoolReserve(formatEther(reserve));
      setTotalExposure(formatEther(exposure));
      setAgents(agentResults);
      setLoadError(null);
      setLastUpdated(new Date());

      // Price read is a state-changing call on FtsoV2 (payable, non-view in the
      // real interface), so we use staticCall for a read-only dashboard ping.
      try {
        const [value, decimals] = await ftso.getXrpUsdPrice.staticCall();
        setXrpPrice(Number(value) / 10 ** Number(decimals));
      } catch {
        // Non-fatal — FTSO feed may not be live on every test network.
        setXrpPrice(null);
      }
    } catch (err) {
      setLoadError(err?.message || "Could not read on-chain data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return { agents, poolReserve, totalExposure, xrpPrice, loading, loadError, lastUpdated, refresh };
}
