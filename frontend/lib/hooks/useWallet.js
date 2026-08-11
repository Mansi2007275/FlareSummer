"use client";

import { useCallback, useEffect, useState } from "react";
import { BrowserProvider } from "ethers";
import { CHAIN } from "../config";

export function useWallet() {
  const [address, setAddress] = useState(null);
  const [provider, setProvider] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  const connect = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      setError("No wallet found. Install MetaMask or another injected wallet to buy cover.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const browserProvider = new BrowserProvider(window.ethereum);
      const accounts = await browserProvider.send("eth_requestAccounts", []);

      const network = await browserProvider.getNetwork();
      if (Number(network.chainId) !== CHAIN.id) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: CHAIN.idHex }],
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: CHAIN.idHex,
                  chainName: CHAIN.name,
                  nativeCurrency: CHAIN.nativeCurrency,
                  rpcUrls: [CHAIN.rpcUrl],
                  blockExplorerUrls: [CHAIN.explorerUrl],
                },
              ],
            });
          } else {
            throw switchError;
          }
        }
      }

      setProvider(browserProvider);
      setAddress(accounts[0]);
    } catch (err) {
      setError(err?.message || "Could not connect wallet.");
    } finally {
      setConnecting(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;
    const handleAccountsChanged = (accounts) => {
      setAddress(accounts?.[0] || null);
    };
    const handleChainChanged = () => {
      window.location.reload();
    };
    window.ethereum.on?.("accountsChanged", handleAccountsChanged);
    window.ethereum.on?.("chainChanged", handleChainChanged);
    return () => {
      window.ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  return { address, provider, connecting, error, connect };
}
