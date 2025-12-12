const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FluxPayAudit", function () {
  let fluxPayAudit;
  let owner, gateway, payer, provider;
  const GATEWAY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GATEWAY_ROLE"));

  beforeEach(async function () {
    let signers = await ethers.getSigners();
    if (signers.length < 4) {
      throw new Error("Need at least 4 signers for tests");
    }
    [owner, gateway, payer, provider] = signers;

    const FluxPayAudit = await ethers.getContractFactory("FluxPayAudit");
    fluxPayAudit = await FluxPayAudit.deploy();
    await fluxPayAudit.waitForDeployment();

    // Grant gateway role to gateway account
    await fluxPayAudit.grantRole(GATEWAY_ROLE, gateway.address);
  });

  describe("Deployment", function () {
    it("Should set the right owner and roles", async function () {
      const ADMIN_ROLE = await fluxPayAudit.DEFAULT_ADMIN_ROLE();
      expect(await fluxPayAudit.hasRole(ADMIN_ROLE, owner.address)).to.equal(true);
    });
  });

  describe("recordIntent", function () {
    const intentId = ethers.keccak256(ethers.toUtf8Bytes("test-intent"));
    const lockedAmount = ethers.parseEther("1");
    const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    it("Should record intent successfully", async function () {
      await expect(fluxPayAudit.connect(gateway).recordIntent(intentId, payer.address, lockedAmount, expiry))
        .to.emit(fluxPayAudit, "IntentLocked")
        .withArgs(intentId, payer.address, lockedAmount, expiry);

      const intent = await fluxPayAudit.getIntent(intentId);
      expect(intent.payer).to.equal(payer.address);
      expect(intent.lockedAmount).to.equal(lockedAmount);
      expect(intent.expiry).to.equal(expiry);
      expect(intent.settled).to.equal(false);
      expect(intent.refunded).to.equal(false);
    });

    it("Should prevent recording duplicate intent", async function () {
      await fluxPayAudit.connect(gateway).recordIntent(intentId, payer.address, lockedAmount, expiry);

      await expect(
        fluxPayAudit.connect(gateway).recordIntent(intentId, payer.address, lockedAmount, expiry)
      ).to.be.revertedWith("Intent already exists");
    });

    it("Should prevent unauthorized recording", async function () {
      await expect(
        fluxPayAudit.connect(payer).recordIntent(intentId, payer.address, lockedAmount, expiry)
      ).to.be.revertedWith("Only gateway can call");
    });
  });

  describe("recordSettlement", function () {
    const intentId = ethers.keccak256(ethers.toUtf8Bytes("test-settlement"));
    const lockedAmount = ethers.parseEther("2");
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const usedAmount = ethers.parseEther("1");
    const nexusTx = ethers.toUtf8Bytes("test-nexus-tx");

    beforeEach(async function () {
      await fluxPayAudit.connect(gateway).recordIntent(intentId, payer.address, lockedAmount, expiry);
    });

    it("Should record settlement successfully", async function () {
      await expect(fluxPayAudit.connect(gateway).recordSettlement(intentId, provider.address, usedAmount, nexusTx))
        .to.emit(fluxPayAudit, "IntentSettled")
        .withArgs(intentId, provider.address, usedAmount, nexusTx);

      const intent = await fluxPayAudit.getIntent(intentId);
      expect(intent.settled).to.equal(true);
    });

    it("Should prevent settling already settled intent", async function () {
      await fluxPayAudit.connect(gateway).recordSettlement(intentId, provider.address, usedAmount, nexusTx);

      await expect(
        fluxPayAudit.connect(gateway).recordSettlement(intentId, provider.address, usedAmount, nexusTx)
      ).to.be.revertedWith("Already settled");
    });

    it("Should prevent settling already refunded intent", async function () {
      await fluxPayAudit.connect(gateway).recordRefund(intentId, nexusTx);

      await expect(
        fluxPayAudit.connect(gateway).recordSettlement(intentId, provider.address, usedAmount, nexusTx)
      ).to.be.revertedWith("Already refunded");
    });

    it("Should prevent settling with amount greater than locked", async function () {
      const excessiveAmount = ethers.parseEther("3");

      await expect(
        fluxPayAudit.connect(gateway).recordSettlement(intentId, provider.address, excessiveAmount, nexusTx)
      ).to.be.revertedWith("Used more than locked");
    });

    it("Should prevent unauthorized settlement", async function () {
      await expect(
        fluxPayAudit.connect(payer).recordSettlement(intentId, provider.address, usedAmount, nexusTx)
      ).to.be.revertedWith("Only gateway can call");
    });
  });

  describe("recordRefund", function () {
    const intentId = ethers.keccak256(ethers.toUtf8Bytes("test-refund"));
    const lockedAmount = ethers.parseEther("1");
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const nexusTx = ethers.toUtf8Bytes("test-refund-tx");

    beforeEach(async function () {
      await fluxPayAudit.connect(gateway).recordIntent(intentId, payer.address, lockedAmount, expiry);
    });

    it("Should record refund successfully", async function () {
      await expect(fluxPayAudit.connect(gateway).recordRefund(intentId, nexusTx))
        .to.emit(fluxPayAudit, "IntentRefunded")
        .withArgs(intentId, nexusTx);

      const intent = await fluxPayAudit.getIntent(intentId);
      expect(intent.refunded).to.equal(true);
    });

    it("Should prevent refunding settled intent", async function () {
      const usedAmount = ethers.parseEther("0.5");
      await fluxPayAudit.connect(gateway).recordSettlement(intentId, provider.address, usedAmount, nexusTx);

      await expect(fluxPayAudit.connect(gateway).recordRefund(intentId, nexusTx)).to.be.revertedWith("Cannot refund settled intent");
    });

    it("Should prevent refunding already refunded intent", async function () {
      await fluxPayAudit.connect(gateway).recordRefund(intentId, nexusTx);

      await expect(fluxPayAudit.connect(gateway).recordRefund(intentId, nexusTx)).to.be.revertedWith("Already refunded");
    });

    it("Should prevent unauthorized refund", async function () {
      await expect(fluxPayAudit.connect(payer).recordRefund(intentId, nexusTx)).to.be.revertedWith("Only gateway can call");
    });
  });

  describe("batchRecordSettlements", function () {
    let intentIds, lockedAmount, expiry, providers, usedAmounts, nexusTxs;

    beforeEach(async function () {
      intentIds = [
        ethers.keccak256(ethers.toUtf8Bytes("batch-1")),
        ethers.keccak256(ethers.toUtf8Bytes("batch-2"))
      ];
      lockedAmount = ethers.parseEther("10");
      expiry = Math.floor(Date.now() / 1000) + 3600;
      providers = [provider.address, payer.address];
      usedAmounts = [ethers.parseEther("2"), ethers.parseEther("3")];
      nexusTxs = [
        ethers.toUtf8Bytes("tx1"),
        ethers.toUtf8Bytes("tx2")
      ];

      for (let i = 0; i < intentIds.length; i++) {
        await fluxPayAudit.connect(gateway).recordIntent(intentIds[i], payer.address, lockedAmount, expiry);
      }
    });

    it("Should batch record settlements successfully", async function () {
      await fluxPayAudit.connect(gateway).batchRecordSettlements(intentIds, providers, usedAmounts, nexusTxs);

      for (let i = 0; i < intentIds.length; i++) {
        const intent = await fluxPayAudit.getIntent(intentIds[i]);
        expect(intent.settled).to.equal(true);
      }
    });

    it("Should revert on array length mismatch", async function () {
      const mismatchedProviders = [provider.address]; // Missing one

      await expect(
        fluxPayAudit.connect(gateway).batchRecordSettlements(intentIds, mismatchedProviders, usedAmounts, nexusTxs)
      ).to.be.revertedWith("Array lengths mismatch");
    });

    it("Should prevent unauthorized batch settlement", async function () {
      await expect(
        fluxPayAudit.connect(payer).batchRecordSettlements(intentIds, providers, usedAmounts, nexusTxs)
      ).to.be.revertedWith("Only gateway can call");
    });
  });

  describe("View functions", function () {
    const intentId = ethers.keccak256(ethers.toUtf8Bytes("view-test"));
    const lockedAmount = ethers.parseEther("5");
    const expiry = Math.floor(Date.now() / 1000) + 3600;

    beforeEach(async function () {
      await fluxPayAudit.connect(gateway).recordIntent(intentId, payer.address, lockedAmount, expiry);
    });

    it("Should return correct intent details", async function () {
      const intent = await fluxPayAudit.getIntent(intentId);
      expect(intent.payer).to.equal(payer.address);
      expect(intent.lockedAmount).to.equal(lockedAmount);
      expect(intent.expiry).to.equal(expiry);
      expect(intent.settled).to.equal(false);
      expect(intent.refunded).to.equal(false);
    });

    it("Should check expired intents", async function () {
      expect(await fluxPayAudit.isExpired(intentId)).to.equal(false);

      // Advance time to after expiry
      await ethers.provider.send("evm_increaseTime", [3700]);
      await ethers.provider.send("evm_mine");

      expect(await fluxPayAudit.isExpired(intentId)).to.equal(true);
    });
  });
});
