const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log("=======================================================");
  console.log(" FXRP Sentinel — deployment");
  console.log("=======================================================");
  console.log("Network :", network);
  console.log("Deployer:", deployer.address);
  console.log(
    "Balance :",
    hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)),
    "native token"
  );
  console.log("-------------------------------------------------------");

  const reporter = process.env.TEE_AGENT_ADDRESS && process.env.TEE_AGENT_ADDRESS.length === 42
    ? process.env.TEE_AGENT_ADDRESS
    : deployer.address;
  const claimsVerifier = process.env.CLAIMS_VERIFIER_ADDRESS && process.env.CLAIMS_VERIFIER_ADDRESS.length === 42
    ? process.env.CLAIMS_VERIFIER_ADDRESS
    : deployer.address;

  // 1. Risk oracle — receives TEE-attested scores
  const RiskOracleConsumer = await hre.ethers.getContractFactory("RiskOracleConsumer");
  const riskOracle = await RiskOracleConsumer.deploy(reporter);
  await riskOracle.waitForDeployment();
  console.log("RiskOracleConsumer deployed:", await riskOracle.getAddress());
  console.log("  reporter (TEE agent wallet):", reporter);

  // 2. FTSO price consumer — standalone utility contract, used by frontend + agent for live prices
  const FtsoV2Consumer = await hre.ethers.getContractFactory("FtsoV2Consumer");
  const ftsoConsumer = await FtsoV2Consumer.deploy();
  await ftsoConsumer.waitForDeployment();
  console.log("FtsoV2Consumer deployed:   ", await ftsoConsumer.getAddress());

  // 3. Insurance pool — the core product
  const InsurancePool = await hre.ethers.getContractFactory("InsurancePool");
  const pool = await InsurancePool.deploy(await riskOracle.getAddress(), claimsVerifier);
  await pool.waitForDeployment();
  console.log("InsurancePool deployed:    ", await pool.getAddress());
  console.log("  claimsVerifier:", claimsVerifier);

  // 4. A couple of mock FAsset agents so the dashboard has something to show immediately
  const MockFAssetAgent = await hre.ethers.getContractFactory("MockFAssetAgent");

  const agentA = await MockFAssetAgent.deploy("FXRP Agent — Kettlebell Capital", 18000, 12000);
  await agentA.waitForDeployment();
  console.log("MockFAssetAgent (A) deployed:", await agentA.getAddress());

  const agentB = await MockFAssetAgent.deploy("FXRP Agent — Solstice Nodes", 12800, 12000);
  await agentB.waitForDeployment();
  console.log("MockFAssetAgent (B) deployed:", await agentB.getAddress());

  // 5. Seed the pool with a small reserve so buyCover() has something to underwrite against.
  const seedAmount = hre.ethers.parseEther("2");
  const seedTx = await pool.fundPool({ value: seedAmount });
  await seedTx.wait();
  console.log(`Seeded pool with ${hre.ethers.formatEther(seedAmount)} native token`);

  console.log("-------------------------------------------------------");
  console.log("Copy these into tee-agent/.env and frontend/.env:");
  console.log("-------------------------------------------------------");
  console.log(`RISK_ORACLE_ADDRESS=${await riskOracle.getAddress()}`);
  console.log(`FTSO_CONSUMER_ADDRESS=${await ftsoConsumer.getAddress()}`);
  console.log(`INSURANCE_POOL_ADDRESS=${await pool.getAddress()}`);
  console.log(`MOCK_AGENT_A_ADDRESS=${await agentA.getAddress()}`);
  console.log(`MOCK_AGENT_B_ADDRESS=${await agentB.getAddress()}`);
  console.log("=======================================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
