import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

let initialized = false;

function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[secrets] unable to parse secret string as JSON');
    return {};
  }
}

async function loadAwsSecrets() {
  const secretId = process.env.AWS_SECRETS_MANAGER_SECRET_ID;
  if (!secretId) {
    // eslint-disable-next-line no-console
    console.warn('[secrets] AWS_SECRETS_MANAGER_SECRET_ID not set; skipping AWS secrets manager');
    return;
  }

  const client = new SecretsManagerClient({
    region: process.env.AWS_REGION ?? 'us-east-1'
  });

  try {
    const command = new GetSecretValueCommand({ SecretId: secretId });
    const response = await client.send(command);
    const secretString =
      response.SecretString ??
      (response.SecretBinary ? Buffer.from(response.SecretBinary as Uint8Array).toString('utf-8') : undefined);

    if (!secretString) {
      // eslint-disable-next-line no-console
      console.warn('[secrets] received empty secret payload from AWS Secrets Manager');
      return;
    }

    const values = safeParseJson(secretString);
    Object.entries(values).forEach(([key, value]) => {
      if (process.env[key] === undefined && typeof value === 'string') {
        process.env[key] = value;
      }
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[secrets] failed to load secrets from AWS Secrets Manager', error);
  }
}

export async function initializeSecrets() {
  if (initialized) {
    return;
  }

  const provider = (process.env.SECRETS_PROVIDER ?? 'env').toLowerCase();

  if (provider === 'aws') {
    await loadAwsSecrets();
  } else if (provider !== 'env') {
    // eslint-disable-next-line no-console
    console.warn(`[secrets] unsupported secrets provider "${provider}", defaulting to environment variables`);
  }

  initialized = true;
}


