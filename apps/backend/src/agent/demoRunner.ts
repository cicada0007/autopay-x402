import axios, { isAxiosError } from 'axios';

const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:4000';

async function runDemo() {
  console.info('🚀 Starting Autopay Agent demo run (market endpoint)...');

  let requestId: string | undefined;

  try {
    const response = await axios.post(`${backendUrl}/api/agent/request`, {
      endpoint: 'market'
    });
    requestId = response.data.requestId;
    console.log('✅ Premium data already unlocked', response.data);
    return;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 402) {
      const data = error.response.data as {
        requestId: string;
        amount: number;
        currency: string;
      };
      requestId = data.requestId;
      console.log('💳 Payment required', data);
    } else {
      throw error;
    }
  }

  if (!requestId) {
    throw new Error('Unable to retrieve request identifier');
  }

  console.info('🔁 Executing simulated payment...');
  const paymentResponse = await axios.post(`${backendUrl}/api/payments/execute`, {
    requestId
  });
  console.log('✅ Payment confirmed', paymentResponse.data);

  console.info('🔓 Retrying premium data fetch...');
  const finalResponse = await axios.post(`${backendUrl}/api/agent/request`, {
    endpoint: 'market',
    requestId
  });
  console.log('📦 Premium data unlocked', finalResponse.data);
}

runDemo().catch((error) => {
  console.error('Demo failed', error);
  process.exit(1);
});

