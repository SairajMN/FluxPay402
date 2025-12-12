const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProviderRegistry", function () {
  let providerRegistry;
  let owner, provider1, provider2, gateway;
  let providerName = "TestAI";
  let providerEndpoint = "https://api.testai.com";
  let publicKeyHash = ethers.keccak256(ethers.toUtf8Bytes("test-public-key"));

  beforeEach(async function () {
    [owner, provider1, provider2, gateway] = await ethers.getSigners();

    const ProviderRegistry = await ethers.getContractFactory("ProviderRegistry");
    providerRegistry = await ProviderRegistry.deploy();
    await providerRegistry.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await providerRegistry.owner()).to.equal(owner.address);
    });
  });

  describe("registerProvider", function () {
    it("Should register provider successfully", async function () {
      await expect(
        providerRegistry.connect(provider1).registerProvider(providerName, providerEndpoint, publicKeyHash)
      )
        .to.emit(providerRegistry, "ProviderRegistered")
        .withArgs(provider1.address, providerName, providerEndpoint);

      const provider = await providerRegistry.providers(provider1.address);
      expect(provider.adminAddress).to.equal(provider1.address);
      expect(provider.name).to.equal(providerName);
      expect(provider.endpoint).to.equal(providerEndpoint);
      expect(provider.publicKeyHash).to.equal(publicKeyHash);
      expect(provider.isActive).to.equal(true);
      expect(await providerRegistry.getProviderCount()).to.equal(1);
    });

    it("Should prevent registering already registered provider", async function () {
      await providerRegistry.connect(provider1).registerProvider(providerName, providerEndpoint, publicKeyHash);

      await expect(
        providerRegistry.connect(provider1).registerProvider("NewName", "https://new.com", publicKeyHash)
      ).to.be.revertedWith("Already registered");
    });
  });

  describe("updateProvider", function () {
    beforeEach(async function () {
      await providerRegistry.connect(provider1).registerProvider(providerName, providerEndpoint, publicKeyHash);
    });

    it("Should update provider details", async function () {
      const newName = "UpdatedAI";
      const newEndpoint = "https://updated.testai.com";
      const newPublicKeyHash = ethers.keccak256(ethers.toUtf8Bytes("updated-public-key"));

      await expect(
        providerRegistry.connect(provider1).updateProvider(newName, newEndpoint, newPublicKeyHash)
      )
        .to.emit(providerRegistry, "ProviderUpdated")
        .withArgs(provider1.address, newEndpoint);

      const provider = await providerRegistry.providers(provider1.address);
      expect(provider.name).to.equal(newName);
      expect(provider.endpoint).to.equal(newEndpoint);
      expect(provider.publicKeyHash).to.equal(newPublicKeyHash);
    });

    it("Should prevent unauthorized update", async function () {
      await expect(
        providerRegistry.connect(provider2).updateProvider("Fake", "https://fake.com", publicKeyHash)
      ).to.be.revertedWith("Not registered provider");
    });
  });

  describe("deactivateProvider", function () {
    beforeEach(async function () {
      await providerRegistry.connect(provider1).registerProvider(providerName, providerEndpoint, publicKeyHash);
    });

    it("Should deactivate provider", async function () {
      await expect(providerRegistry.connect(provider1).deactivateProvider())
        .to.emit(providerRegistry, "ProviderDeactivated")
        .withArgs(provider1.address);

      expect(await providerRegistry.isProviderActive(provider1.address)).to.equal(false);
    });

    it("Should prevent unauthorized deactivation", async function () {
      await expect(providerRegistry.connect(provider2).deactivateProvider()).to.be.revertedWith("Not registered provider");
    });
  });

  describe("setPricingRule", function () {
    const endpointHash = ethers.keccak256(ethers.toUtf8Bytes("gpt-4"));
    const minBudget = ethers.parseEther("0.01");
    const maxBudget = ethers.parseEther("10");
    const basePrice = ethers.parseEther("0.001");
    const pricePerToken = ethers.parseEther("0.00001");
    const pricePerKb = ethers.parseEther("0.0001");
    const slaTimeout = 30;

    beforeEach(async function () {
      await providerRegistry.connect(provider1).registerProvider(providerName, providerEndpoint, publicKeyHash);
    });

    it("Should set pricing rule", async function () {
      await expect(
        providerRegistry.connect(provider1).setPricingRule(
          endpointHash,
          minBudget,
          maxBudget,
          basePrice,
          pricePerToken,
          pricePerKb,
          slaTimeout
        )
      )
        .to.emit(providerRegistry, "PricingRuleSet")
        .withArgs(endpointHash, basePrice);

      const pricing = await providerRegistry.getPricing(endpointHash);
      expect(pricing.minBudget).to.equal(minBudget);
      expect(pricing.maxBudget).to.equal(maxBudget);
      expect(pricing.basePrice).to.equal(basePrice);
      expect(pricing.pricePerToken).to.equal(pricePerToken);
      expect(pricing.pricePerKb).to.equal(pricePerKb);
      expect(pricing.slaTimeout).to.equal(slaTimeout);
    });

    it("Should prevent setting pricing for inactive provider", async function () {
      await providerRegistry.connect(provider1).deactivateProvider();

      await expect(
        providerRegistry.connect(provider1).setPricingRule(
          endpointHash,
          minBudget,
          maxBudget,
          basePrice,
          pricePerToken,
          pricePerKb,
          slaTimeout
        )
      ).to.be.revertedWith("Provider not active");
    });

    it("Should prevent unauthorized pricing rule setting", async function () {
      await expect(
        providerRegistry.connect(provider2).setPricingRule(
          endpointHash,
          minBudget,
          maxBudget,
          basePrice,
          pricePerToken,
          pricePerKb,
          slaTimeout
        )
      ).to.be.revertedWith("Not registered provider");
    });
  });

  describe("getPricing", function () {
    const endpointHash = ethers.keccak256(ethers.toUtf8Bytes("test-endpoint"));

    it("Should return pricing rule", async function () {
      await providerRegistry.connect(provider1).registerProvider(providerName, providerEndpoint, publicKeyHash);

      const minBudget = 1000;
      const basePrice = 100;
      await providerRegistry.connect(provider1).setPricingRule(
        endpointHash,
        minBudget,
        0,
        basePrice,
        10,
        20,
        60
      );

      const pricing = await providerRegistry.getPricing(endpointHash);
      expect(pricing.minBudget).to.equal(minBudget);
      expect(pricing.basePrice).to.equal(basePrice);
    });
  });

  describe("authorizeGateway and revokeGateway", function () {
    it("Should authorize gateway", async function () {
      await expect(providerRegistry.connect(owner).authorizeGateway(gateway.address))
        .to.emit(providerRegistry, "GatewayAuthorized")
        .withArgs(gateway.address);

      expect(await providerRegistry.authorizedGateways(gateway.address)).to.equal(true);
    });

    it("Should revoke gateway", async function () {
      await providerRegistry.connect(owner).authorizeGateway(gateway.address);

      await expect(providerRegistry.connect(owner).revokeGateway(gateway.address))
        .to.emit(providerRegistry, "GatewayRevoked")
        .withArgs(gateway.address);

      expect(await providerRegistry.authorizedGateways(gateway.address)).to.equal(false);
    });

    it("Should prevent non-owner from authorizing gateway", async function () {
      await expect(
        providerRegistry.connect(provider1).authorizeGateway(gateway.address)
      ).to.be.revertedWithCustomError(providerRegistry, "OwnableUnauthorizedAccount");
    });

    it("Should prevent non-owner from revoking gateway", async function () {
      await expect(
        providerRegistry.connect(provider1).revokeGateway(gateway.address)
      ).to.be.revertedWithCustomError(providerRegistry, "OwnableUnauthorizedAccount");
    });
  });

  describe("isValidProviderSignature", function () {
    const intentId = ethers.keccak256(ethers.toUtf8Bytes("test-intent"));
    const receiptHash = ethers.keccak256(ethers.toUtf8Bytes("receipt-data"));

    beforeEach(async function () {
      await providerRegistry.connect(provider1).registerProvider(providerName, providerEndpoint, publicKeyHash);
    });

    it("Should validate correct signature", async function () {
      const message = ethers.solidityPacked(["bytes32", "address", "bytes32"], [intentId, provider1.address, receiptHash]);

      const signature = await provider1.signMessage(ethers.getBytes(message));
      const recoveredSigner = ethers.verifyMessage(ethers.getBytes(message), signature);
      expect(recoveredSigner).to.equal(provider1.address);

      const isValid = await providerRegistry.isValidProviderSignature(intentId, provider1.address, receiptHash, signature);
      expect(isValid).to.equal(true);
    });

    it("Should reject invalid signature", async function () {
      const fakeSignature = ethers.getBytes("0x" + "aa".repeat(64) + "1b");

      const isValid = await providerRegistry.isValidProviderSignature(intentId, provider1.address, receiptHash, fakeSignature);
      expect(isValid).to.equal(false);
    });

    it("Should reject inactive provider signature", async function () {
      await providerRegistry.connect(provider1).deactivateProvider();

      const message = ethers.solidityPacked(["bytes32", "address", "bytes32"], [intentId, provider1.address, receiptHash]);
      const signature = await provider1.signMessage(message);

      const isValid = await providerRegistry.isValidProviderSignature(intentId, provider1.address, receiptHash, signature);
      expect(isValid).to.equal(false);
    });
  });

  describe("Other view functions", function () {
    it("Should return correct provider count", async function () {
      expect(await providerRegistry.getProviderCount()).to.equal(0);

      await providerRegistry.connect(provider1).registerProvider(providerName, providerEndpoint, publicKeyHash);
      expect(await providerRegistry.getProviderCount()).to.equal(1);

      await providerRegistry.connect(provider2).registerProvider("Provider2", "https://api2.com", publicKeyHash);
      expect(await providerRegistry.getProviderCount()).to.equal(2);
    });

    it("Should check provider active status", async function () {
      expect(await providerRegistry.isProviderActive(provider1.address)).to.equal(false);

      await providerRegistry.connect(provider1).registerProvider(providerName, providerEndpoint, publicKeyHash);
      expect(await providerRegistry.isProviderActive(provider1.address)).to.equal(true);

      await providerRegistry.connect(provider1).deactivateProvider();
      expect(await providerRegistry.isProviderActive(provider1.address)).to.equal(false);
    });
  });
});
