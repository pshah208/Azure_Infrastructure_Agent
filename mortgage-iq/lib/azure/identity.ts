/**
 * Shared Azure credential — the first thing every lib/azure/* client reaches
 * for. Modelled on Lulu IQ's lib/azure/identity.ts.
 *
 * In the Container App: picks up the user-assigned managed identity via the
 * AZURE_CLIENT_ID env var that Container Apps injects.
 * Locally: falls through to the developer's `az login` identity.
 *
 * Cached at module scope so a single token cache is shared across callers.
 */

import { DefaultAzureCredential, type TokenCredential } from "@azure/identity";

let cached: TokenCredential | undefined;

export function getAzureCredential(): TokenCredential {
  if (!cached) {
    cached = new DefaultAzureCredential({
      managedIdentityClientId: process.env.AZURE_CLIENT_ID,
    });
  }
  return cached;
}
