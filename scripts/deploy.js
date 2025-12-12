const { ethers } = require("hardhat");

async function main() {
  console.log("Starting FluxPay Nexus deployment...");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", await deployer.getAddress());
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  // Deploy FluxPayAudit contract
  console.log("Deploying FluxPayAudit...");
  const FluxPayAudit = await ethers.getContractFactory("FluxPayAudit");
  const audit = await FluxPayAudit.deploy();
  await audit.waitForDeployment();
  const auditAddress = await audit.getAddress();
  console.log("FluxPayAudit deployed to:", auditAddress);

  // Deploy ProviderRegistry contract
  console.log("Deploying ProviderRegistry...");
  const ProviderRegistry = await ethers.getContractFactory("ProviderRegistry");
  const registry = await ProviderRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("ProviderRegistry deployed to:", registryAddress);

  // Authorize the deployer as gateway in both contracts
  console.log("Setting up contract permissions...");
  const GATEWAY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GATEWAY_ROLE"));

  // Authorize deployer as gateway in ProviderRegistry (uses authorizeGateway function)
  await registry.authorizeGateway(deployer.address);
  console.log("Authorized deployer as gateway in ProviderRegistry");

  // Grant gateway role to deployer in FluxPayAudit (uses AccessControl)
  await audit.grantRole(GATEWAY_ROLE, deployer.address);
  console.log("Authorized deployer as gateway in FluxPayAudit");

  console.log("\nDeployment completed successfully!");
  console.log("==================================================");
  console.log("FluxPayAudit:", auditAddress);
  console.log("ProviderRegistry:", registryAddress);
  console.log("==================================================");
  console.log("Update your .env file with these contract addresses:");
  console.log(`FLUXPAY_AUDIT_CONTRACT=${auditAddress}`);
  console.log(`PROVIDER_REGISTRY_CONTRACT=${registryAddress}`);
  console.log("==================================================");

  // Save deployment info for verification
  const deploymentInfo = {
    network: network.name,
    auditContract: auditAddress,
    registryContract: registryAddress,
    deployer: await deployer.getAddress(),
    timestamp: new Date().toISOString(),
    blockNumber: await deployer.provider.getBlockNumber(),
  };

  console.log("Deployment info:", JSON.stringify(deploymentInfo, null, 2));

  // Verify contracts on Etherscan (if not localhost/hardhat)
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("Verifying contracts on Etherscan...");

    try {
      await hre.run("verify:verify", {
        address: auditAddress,
        constructorArguments: [],
      });
      console.log("FluxPayAudit verified on Etherscan");

      await hre.run("verify:verify", {
        address: registryAddress,
        constructorArguments: [],
      });
      console.log("ProviderRegistry verified on Etherscan");
    } catch (error) {
      console.log("Contract verification failed:", error.message);
      console.log("You can manually verify later with:");
      console.log(`npx hardhat verify --network ${network.name} ${auditAddress}`);
      console.log(`npx hardhat verify --network ${network.name} ${registryAddress}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
