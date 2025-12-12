const { NexusAdapter } = require('./backend/nexusAdapter');

async function testNexus() {
  console.log('Testing Nexus SDK initialization...');

  try {
    const adapter = new NexusAdapter();

    console.log('NexusAdapter created successfully');
    console.log('Initializing SDK...');

    // Initialize with proper configuration for testnet
    await adapter.initialize();

    console.log('Initializing complete');

    if (adapter.sdk) {
      console.log('SDK object exists:', typeof adapter.sdk);
      console.log('SDK is initialized:', adapter.initialized);

      // Check if it's using real SDK or mock
      const hasRealSDK = adapter.sdk.intent &&
                         adapter.sdk.intent.create &&
                         typeof adapter.sdk.intent.create === 'function';

      if (hasRealSDK && !adapter.sdk.intent.create.toString().includes('mock')) {
        console.log('✅ Using real Avail Nexus SDK');
      } else {
        console.log('⚠️ Using mock implementation (real SDK not available)');
      }
    } else {
      console.log('❌ No SDK object found');
    }

    // Try to get balance for a test address
    try {
      const balance = await adapter.getUnifiedBalance('0x742d35Cc6634C0532925a3b844Bc454e4438f44e');
      console.log('Balance test result:', balance);
    } catch (error) {
      console.log('Balance test failed:', error.message);
    }

  } catch (error) {
    console.error('NexusAdapter creation/initialization failed:', error.message);
    console.error(error.stack);
  }
}

testNexus();
