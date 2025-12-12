const { expect } = require("chai");
const { NexusAdapter } = require("../backend/nexusAdapter");

describe("NexusAdapter Integration", function () {
  let nexusAdapter;

  before(async function () {
    // Set a timeout for tests that might involve network calls
    this.timeout(10000);

    try {
      nexusAdapter = new NexusAdapter();
      console.log("NexusAdapter created successfully");
    } catch (error) {
      console.error("Failed to create NexusAdapter:", error.message);

      // If it's a missing API key error, skip the test rather than fail
      if (error.message.includes("API key") || error.message.includes("NEXUS_API_KEY")) {
        console.log("Skipping tests due to missing API key - this is expected in test environment");
        this.skip();
      }

      throw error;
    }
  });

  describe("Initialization", function () {
    it("Should initialize with real NexusSDK", function () {
      expect(nexusAdapter).to.be.an("object");
      expect(nexusAdapter.sdk).to.exist;
      expect(typeof nexusAdapter.sdk).to.equal("object");

      // Check that the SDK has the expected methods
      expect(nexusAdapter.sdk.intent).to.exist;
      expect(nexusAdapter.sdk.balance).to.exist;
      expect(nexusAdapter.sdk.contract).to.exist;
      expect(nexusAdapter.sdk.dataAvailability).to.exist;
    });

    it("Should have correct contract addresses configured", function () {
      expect(nexusAdapter.contracts).to.be.an("object");
      expect(nexusAdapter.contracts.audit).to.be.a("string");
      expect(nexusAdapter.contracts.registry).to.be.a("string");
    });
  });

  // Note: We skip actual API calls since we don't want to make real requests in tests
  // In a real testing environment, these would mock the SDK responses

  describe("Core methods exist", function () {
    it("Should have createIntent method", function () {
      expect(typeof nexusAdapter.createIntent).to.equal("function");
    });

    it("Should have getIntentStatus method", function () {
      expect(typeof nexusAdapter.getIntentStatus).to.equal("function");
    });

    it("Should have settleIntent method", function () {
      expect(typeof nexusAdapter.settleIntent).to.equal("function");
    });

    it("Should have refundIntent method", function () {
      expect(typeof nexusAdapter.refundIntent).to.equal("function");
    });

    it("Should have anchorReceipts method", function () {
      expect(typeof nexusAdapter.anchorReceipts).to.equal("function");
    });

    it("Should have getUnifiedBalance method", function () {
      expect(typeof nexusAdapter.getUnifiedBalance).to.equal("function");
    });
  });
});
