/**
 * Fabric IQ data access via the Fabric SQL analytics endpoint.
 *
 * Modelled on Lulu IQ's config-guard pattern (lib/azure/fabric.ts): when a real
 * Fabric endpoint is configured, query it with a managed-identity access token;
 * otherwise return null so callers fall through to local synthetic JSON. The
 * connection pool is cached at module scope.
 */

import sql from "mssql";
import { getAzureCredential } from "./identity";
import {
  FABRIC_SQL_ENDPOINT,
  FABRIC_DATABASE,
  isFabricConfigured,
} from "../constants";

const DB_SCOPE = "https://database.windows.net/.default";
let cachedPool: sql.ConnectionPool | undefined;

async function getPool(): Promise<sql.ConnectionPool> {
  if (cachedPool?.connected) return cachedPool;
  const token = (await getAzureCredential().getToken(DB_SCOPE))?.token;
  if (!token) throw new Error("could not acquire a Fabric SQL access token");
  cachedPool = await new sql.ConnectionPool({
    server: FABRIC_SQL_ENDPOINT,
    port: 1433,
    database: FABRIC_DATABASE,
    // 'strict' = TDS 8.0 pure-TLS. Fabric's SQL gateway resets tedious's older
    // TDS 7.4 TLS-over-TDS negotiation (ESOCKET / socket hang up), so use strict.
    options: { encrypt: "strict" as unknown as boolean, trustServerCertificate: false },
    connectionTimeout: 30000,
    authentication: {
      type: "azure-active-directory-access-token",
      options: { token },
    },
  }).connect();
  return cachedPool;
}

/**
 * Return the first row of `table` where `matchColumn = value`, or null. Returns
 * null immediately (no throw) when Fabric isn't configured so the IQ tools can
 * fall back to local JSON.
 */
export async function queryOne<T = Record<string, unknown>>(
  table: string,
  matchColumn: string,
  value: string,
): Promise<T | null> {
  if (!isFabricConfigured()) return null;
  const pool = await getPool();
  const result = await pool
    .request()
    .input("value", sql.NVarChar, value)
    .query(`SELECT TOP 1 * FROM ${table} WHERE ${matchColumn} = @value`);
  return (result.recordset[0] as T) ?? null;
}
