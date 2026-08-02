import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The Azure SDKs are server-only; keep them out of the client bundle.
  serverExternalPackages: [
    "@azure/ai-agents",
    "@azure/identity",
    "@azure/keyvault-secrets",
    "@azure/search-documents",
    "mssql",
  ],
};

export default nextConfig;
