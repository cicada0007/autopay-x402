import crypto from 'crypto';

describe('verifyFacilitatorSignature', () => {
  const body = JSON.stringify({ txHash: 'abc123', status: 'confirmed' });

  afterEach(() => {
    delete process.env.COINBASE_FACILITATOR_SECRET;
    jest.resetModules();
  });

  it('returns true when the signature matches the request body', async () => {
    process.env.COINBASE_FACILITATOR_SECRET = 'test-signing-secret';
    jest.resetModules();

    const signature = crypto
      .createHmac('sha256', 'test-signing-secret')
      .update(body, 'utf8')
      .digest('hex');

    const { verifyFacilitatorSignature } = await import('../src/services/facilitatorService');

    expect(verifyFacilitatorSignature(signature, body)).toBe(true);
  });

  it('returns false when the signature is invalid', async () => {
    process.env.COINBASE_FACILITATOR_SECRET = 'test-signing-secret';
    jest.resetModules();

    const invalidSignature = crypto
      .createHmac('sha256', 'other-secret')
      .update(body, 'utf8')
      .digest('hex');

    const { verifyFacilitatorSignature } = await import('../src/services/facilitatorService');

    expect(verifyFacilitatorSignature(invalidSignature, body)).toBe(false);
  });

  it('returns false when no facilitator secret is configured', async () => {
    delete process.env.COINBASE_FACILITATOR_SECRET;
    jest.resetModules();

    const { verifyFacilitatorSignature } = await import('../src/services/facilitatorService');

    const signature = crypto
      .createHmac('sha256', 'untracked-secret')
      .update(body, 'utf8')
      .digest('hex');

    expect(verifyFacilitatorSignature(signature, body)).toBe(false);
  });
});


