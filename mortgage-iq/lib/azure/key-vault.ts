/**
 * Key Vault secret reader. Modelled on Lulu IQ's lib/azure/key-vault.ts.
 *
 * Secrets (AI Search key, Fabric SP secret, ...) live in Key Vault and are read
 * at runtime via the shared managed-identity credential. Values are cached at
 * module scope. Returns undefined (never throws) when KV isn't configured so
 * callers can fall back to local/env behaviour.
 */

import { SecretClient } from "@azure/keyvault-secrets";
import { getAzureCredential } from "./identity";

let cachedClient: SecretClient | undefined;
const secretCache = new Map<string, string | undefined>();

function getClient(): SecretClient | undefined {
  const uri = process.env.AZURE_KEY_VAULT_URI;
  if (!uri) return undefined;
  if (!cachedClient) {
    cachedClient = new SecretClient(uri, getAzureCredential());
  }
  return cachedClient;
}

export async function getSecret(name: string): Promise<string | undefined> {
  if (secretCache.has(name)) return secretCache.get(name);
  const client = getClient();
  if (!client) return undefined;
  try {
    const secret = await client.getSecret(name);
    secretCache.set(name, secret.value);
    return secret.value;
  } catch (err) {
    console.warn(
      `[key-vault] could not read secret '${name}':`,
      err instanceof Error ? err.message : err,
    );
    secretCache.set(name, undefined);
    return undefined;
  }
}
