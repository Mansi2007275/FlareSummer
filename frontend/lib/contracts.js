import { Contract, JsonRpcProvider } from "ethers";
import { ADDRESSES, CHAIN } from "./config";

import InsurancePoolAbi from "./abi/InsurancePool.json";
import RiskOracleConsumerAbi from "./abi/RiskOracleConsumer.json";
import FtsoV2ConsumerAbi from "./abi/FtsoV2Consumer.json";
import MockFAssetAgentAbi from "./abi/MockFAssetAgent.json";

export const ABIS = {
  InsurancePool: InsurancePoolAbi,
  RiskOracleConsumer: RiskOracleConsumerAbi,
  FtsoV2Consumer: FtsoV2ConsumerAbi,
  MockFAssetAgent: MockFAssetAgentAbi,
};

let readProvider = null;

/** Read-only provider — used for public dashboard data, no wallet needed. */
export function getReadProvider() {
  if (!readProvider) {
    readProvider = new JsonRpcProvider(CHAIN.rpcUrl, CHAIN.id);
  }
  return readProvider;
}

export function getInsurancePool(signerOrProvider) {
  return new Contract(ADDRESSES.insurancePool, ABIS.InsurancePool, signerOrProvider || getReadProvider());
}

export function getRiskOracle(signerOrProvider) {
  return new Contract(ADDRESSES.riskOracle, ABIS.RiskOracleConsumer, signerOrProvider || getReadProvider());
}

export function getFtsoConsumer(signerOrProvider) {
  return new Contract(ADDRESSES.ftsoConsumer, ABIS.FtsoV2Consumer, signerOrProvider || getReadProvider());
}

export function getMockAgent(address, signerOrProvider) {
  return new Contract(address, ABIS.MockFAssetAgent, signerOrProvider || getReadProvider());
}
