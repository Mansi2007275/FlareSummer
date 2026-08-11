const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("FXRP Sentinel", function () {
  async function deployFixture() {
    const [owner, teeAgent, claimsVerifier, alice, bob] = await ethers.getSigners();

    const RiskOracleConsumer = await ethers.getContractFactory("RiskOracleConsumer");
    const riskOracle = await RiskOracleConsumer.deploy(teeAgent.address);

    const InsurancePool = await ethers.getContractFactory("InsurancePool");
    const pool = await InsurancePool.deploy(await riskOracle.getAddress(), claimsVerifier.address);

    const MockFAssetAgent = await ethers.getContractFactory("MockFAssetAgent");
    const safeAgent = await MockFAssetAgent.deploy("Safe Agent", 18000, 12000);
    const riskyAgent = await MockFAssetAgent.deploy("Risky Agent", 12500, 12000);

    // Seed the pool so it can underwrite cover.
    await pool.connect(owner).fundPool({ value: ethers.parseEther("10") });

    return { owner, teeAgent, claimsVerifier, alice, bob, riskOracle, pool, safeAgent, riskyAgent };
  }

  describe("RiskOracleConsumer", function () {
    it("only allows the designated reporter to submit scores", async function () {
      const { riskOracle, alice, safeAgent } = await deployFixture();
      await expect(
        riskOracle.connect(alice).submitRiskScore(await safeAgent.getAddress(), 10, ethers.encodeBytes32String("x"), 1)
      ).to.be.revertedWithCustomError(riskOracle, "NotReporter");
    });

    it("returns max risk (100) for an agent that has never been scored", async function () {
      const { riskOracle, safeAgent } = await deployFixture();
      expect(await riskOracle.getRiskScore(await safeAgent.getAddress())).to.equal(100);
    });

    it("stores and returns a fresh score from the reporter", async function () {
      const { riskOracle, teeAgent, safeAgent } = await deployFixture();
      const hash = ethers.keccak256(ethers.toUtf8Bytes("attestation-1"));
      await riskOracle.connect(teeAgent).submitRiskScore(await safeAgent.getAddress(), 15, hash, 1);
      expect(await riskOracle.getRiskScore(await safeAgent.getAddress())).to.equal(15);

      const data = await riskOracle.getRiskData(await safeAgent.getAddress());
      expect(data.score).to.equal(15);
      expect(data.attestationHash).to.equal(hash);
      expect(data.isFresh).to.equal(true);
    });

    it("falls back to max risk once a score goes stale", async function () {
      const { riskOracle, teeAgent, safeAgent } = await deployFixture();
      await riskOracle.connect(teeAgent).submitRiskScore(await safeAgent.getAddress(), 15, ethers.ZeroHash, 1);
      await time.increase(3601); // > STALE_AFTER (1 hour)
      expect(await riskOracle.getRiskScore(await safeAgent.getAddress())).to.equal(100);
    });
  });

  describe("Premium pricing", function () {
    it("charges a strictly higher premium for a riskier agent, same amount and duration", async function () {
      const { riskOracle, teeAgent, pool, safeAgent, riskyAgent } = await deployFixture();

      await riskOracle.connect(teeAgent).submitRiskScore(await safeAgent.getAddress(), 10, ethers.ZeroHash, 1);
      await riskOracle.connect(teeAgent).submitRiskScore(await riskyAgent.getAddress(), 85, ethers.ZeroHash, 1);

      const coverAmount = ethers.parseEther("1");
      const duration = 30;

      const [safePremium] = await pool.calculatePremium(await safeAgent.getAddress(), coverAmount, duration);
      const [riskyPremium] = await pool.calculatePremium(await riskyAgent.getAddress(), coverAmount, duration);

      expect(riskyPremium).to.be.gt(safePremium);
    });
  });

  describe("Buying cover and claiming payout", function () {
    it("lets a user buy cover, then pays out automatically once liquidation is verified", async function () {
      const { riskOracle, teeAgent, claimsVerifier, pool, alice, riskyAgent } = await deployFixture();

      await riskOracle.connect(teeAgent).submitRiskScore(await riskyAgent.getAddress(), 70, ethers.ZeroHash, 1);

      const coverAmount = ethers.parseEther("1");
      const duration = 30;
      const [premium] = await pool.calculatePremium(await riskyAgent.getAddress(), coverAmount, duration);

      const tx = await pool.connect(alice).buyCover(await riskyAgent.getAddress(), coverAmount, duration, {
        value: premium,
      });
      const receipt = await tx.wait();
      const purchaseEvent = receipt.logs
        .map((log) => {
          try {
            return pool.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed && parsed.name === "CoverPurchased");
      const coverId = purchaseEvent.args.coverId;

      // Agent gets liquidated in real life; the mock flips its own flag...
      await riskyAgent.simulateLiquidation();
      // ...and the claims verifier (stand-in for an FDC-verifying relayer) confirms it on-chain.
      await pool.connect(claimsVerifier).reportVerifiedLiquidation(await riskyAgent.getAddress());

      const balanceBefore = await ethers.provider.getBalance(alice.address);
      const payoutTx = await pool.connect(alice).triggerPayout(coverId);
      const payoutReceipt = await payoutTx.wait();
      const gasUsed = payoutReceipt.gasUsed * payoutReceipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(alice.address);

      expect(balanceAfter - balanceBefore + gasUsed).to.equal(coverAmount);

      const cover = await pool.covers(coverId);
      expect(cover.claimed).to.equal(true);
      expect(cover.active).to.equal(false);
    });

    it("reverts a payout attempt if liquidation was never verified", async function () {
      const { riskOracle, teeAgent, pool, alice, riskyAgent } = await deployFixture();
      await riskOracle.connect(teeAgent).submitRiskScore(await riskyAgent.getAddress(), 70, ethers.ZeroHash, 1);

      const coverAmount = ethers.parseEther("1");
      const [premium] = await pool.calculatePremium(await riskyAgent.getAddress(), coverAmount, 30);
      const tx = await pool.connect(alice).buyCover(await riskyAgent.getAddress(), coverAmount, 30, { value: premium });
      const receipt = await tx.wait();
      const coverId = receipt.logs
        .map((log) => {
          try {
            return pool.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed && parsed.name === "CoverPurchased").args.coverId;

      await expect(pool.connect(alice).triggerPayout(coverId)).to.be.revertedWithCustomError(
        pool,
        "AgentNotVerifiedLiquidated"
      );
    });

    it("rejects cover requests that would exceed the pool's free reserve", async function () {
      const { riskOracle, teeAgent, pool, alice, riskyAgent } = await deployFixture();
      await riskOracle.connect(teeAgent).submitRiskScore(await riskyAgent.getAddress(), 50, ethers.ZeroHash, 1);

      const tooMuch = ethers.parseEther("999"); // pool only holds 10 ether
      await expect(
        pool.connect(alice).buyCover(await riskyAgent.getAddress(), tooMuch, 30, { value: ethers.parseEther("100") })
      ).to.be.reverted; // reverts on InvalidAmount (exceeds maxCoverWei) before reserve check
    });

    it("refunds any overpayment above the quoted premium", async function () {
      const { riskOracle, teeAgent, pool, alice, safeAgent } = await deployFixture();
      await riskOracle.connect(teeAgent).submitRiskScore(await safeAgent.getAddress(), 5, ethers.ZeroHash, 1);

      const coverAmount = ethers.parseEther("1");
      const [premium] = await pool.calculatePremium(await safeAgent.getAddress(), coverAmount, 30);
      const overpay = premium + ethers.parseEther("0.5");

      const balanceBefore = await ethers.provider.getBalance(alice.address);
      const tx = await pool.connect(alice).buyCover(await safeAgent.getAddress(), coverAmount, 30, { value: overpay });
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(alice.address);

      // Alice should only be down by premium + gas, not the full overpay.
      expect(balanceBefore - balanceAfter - gasUsed).to.equal(premium);
    });
  });
});
