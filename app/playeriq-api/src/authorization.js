import { createRemoteJWKSet, errors, jwtVerify } from "jose";

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const appRoles = ["PlayerIQ.Admin", "PlayerIQ.Coach", "PlayerIQ.Viewer"];
const failure = (statusCode, message) => Object.assign(new Error(message), { statusCode });

function identifier(value) {
  return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 200;
}

export function permissionsFor(roles) {
  const admin = roles.includes("PlayerIQ.Admin");
  const coach = admin || roles.includes("PlayerIQ.Coach");
  return { read: coach || roles.includes("PlayerIQ.Viewer"), upload: coach, review: coach, admin };
}

function validateConfiguration(config) {
  if (config.authEnabled === false) {
    if (!config.enableMockAzure || !["development", "test"].includes(config.nodeEnv)) {
      throw new Error("AUTH_ENABLED=false is permitted only with ENABLE_MOCK_AZURE=true and NODE_ENV=development or test.");
    }
    return;
  }
  for (const key of ["authTenantId", "authApiClientId", "authSpaClientId"]) {
    if (!guid.test(config[key] || "")) throw new Error(`${key} must be a Microsoft Entra GUID. Authentication is required by default.`);
  }
  if (!URL.canParse(config.allowOrigin)) throw new Error("ALLOW_ORIGIN must be the exact frontend origin.");
  const origin = new URL(config.allowOrigin);
  if (origin.origin !== config.allowOrigin ||
      (origin.protocol !== "https:" && !(config.nodeEnv !== "production" &&
        origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)))) {
    throw new Error("ALLOW_ORIGIN must be the exact HTTPS frontend origin (HTTP loopback is allowed outside production).");
  }
  if (!Array.isArray(config.authMemberships)) throw new Error("AUTH_MEMBERSHIPS_JSON must be an array.");
  for (const member of config.authMemberships) {
    if (!member || !guid.test(member.objectId || "") || !identifier(member.organizationId) ||
        member.organizationId === "*" || !Array.isArray(member.playerIds) || !member.playerIds.length ||
        !member.playerIds.every(identifier)) {
      throw new Error("Each auth membership requires an objectId GUID, an explicit organizationId, and a nonempty playerIds array.");
    }
  }
}

function requiredPermission(req) {
  const path = req.path.toLowerCase().replace(/\/$/, "");
  if (req.method === "GET" && path === "/auth/me") return "read";
  if (req.method === "GET" && (/^\/players\/[^/]+\/matches$/.test(path) ||
      /^\/uploads\/[^/]+(?:\/frames\/[^/]+)?$/.test(path))) return "read";
  if (req.method === "POST" && /^\/uploads(?:\/initiate|\/complete)?$/.test(path)) return "upload";
  if (req.method === "POST" && /^\/uploads\/[^/]+\/reviews$/.test(path)) return "review";
  if (req.method === "GET" && ["/foundry-agents", "/synthetic-test-data"].includes(path)) return "admin";
  if (req.method === "POST" && (/^\/foundry-agents\/[^/]+\/run$/.test(path) ||
      path === "/foundry-agents/synthetic-data" ||
      ["/analysis/video-evidence", "/analysis/agent-pipeline", "/analysis/synthetic"].includes(path))) return "admin";
  return null;
}

export function authorizeScope(req, organizationId, playerId) {
  if (req.localMockAuthentication) return;
  const memberships = req.principal?.memberships || [];
  if (!memberships.some((member) => member.organizationId === organizationId &&
      (playerId === undefined || member.playerIds.includes("*") || member.playerIds.includes(playerId)))) {
    throw failure(403, "Your account does not have access to this organization or player.");
  }
}

export function createAuthorization(config, keys) {
  validateConfiguration(config);
  const enabled = config.authEnabled !== false;
  const tenantId = config.authTenantId?.toLowerCase();
  const issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
  const keySet = enabled ? keys || createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`),
    { timeoutDuration: 5000 }
  ) : null;

  return {
    publicConfig: enabled
      ? { enabled, tenantId, clientId: config.authSpaClientId, scope: `api://${config.authApiClientId}/access_as_user` }
      : { enabled },
    async middleware(req, res, next) {
      res.set("Cache-Control", "no-store");
      if (!enabled) {
        const address = req.socket.remoteAddress;
        if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address)) {
          return res.status(403).json({ error: "Unauthenticated mock mode is available only on loopback." });
        }
        req.localMockAuthentication = true;
        return next();
      }
      const authorization = req.get("authorization") || "";
      const match = /^Bearer ([^\s]+)$/i.exec(authorization);
      if (!match || match[1].length > 16384) {
        res.set("WWW-Authenticate", "Bearer");
        return res.status(401).json({ error: "Sign in to PlayerIQ to access this API." });
      }
      let payload;
      try {
        ({ payload } = await jwtVerify(match[1], keySet, {
          algorithms: ["RS256"], issuer, audience: config.authApiClientId,
          requiredClaims: ["exp", "iat", "sub", "oid", "tid", "scp", "azp"],
          clockTolerance: 5
        }));
        if (payload.ver !== "2.0" || payload.tid !== tenantId || !guid.test(payload.oid) ||
            payload.azp !== config.authSpaClientId ||
            typeof payload.scp !== "string" || !payload.scp.split(" ").includes("access_as_user")) {
          throw failure(401, "The access token is not valid for this application.");
        }
      } catch (error) {
        if (error.statusCode === 401 || (error instanceof errors.JOSEError &&
            !["ERR_JWKS_TIMEOUT", "ERR_JWKS_INVALID", "ERR_JWK_INVALID"].includes(error.code))) {
          res.set("WWW-Authenticate", 'Bearer error="invalid_token"');
          return res.status(401).json({ error: "Your session is invalid or expired. Sign in again." });
        }
        console.error("Microsoft Entra token verification unavailable.", { code: error.code, message: error.message });
        return res.status(503).json({ error: "Sign-in verification is temporarily unavailable. Retry shortly." });
      }
      const roles = Array.isArray(payload.roles) ? appRoles.filter((role) => payload.roles.includes(role)) : [];
      const memberships = config.authMemberships
        .filter((member) => member.objectId.toLowerCase() === payload.oid.toLowerCase())
        .map(({ organizationId, playerIds }) => ({ organizationId, playerIds: [...playerIds] }));
      const permissions = permissionsFor(roles);
      if (!permissions.read || !memberships.length) {
        return res.status(403).json({ error: "An administrator must assign your PlayerIQ app role and organization/player membership." });
      }
      req.principal = {
        objectId: payload.oid, tenantId,
        name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim().slice(0, 200) : payload.oid,
        roles, permissions, memberships
      };
      const permission = requiredPermission(req);
      if (!permission || !permissions[permission]) {
        return res.status(403).json({ error: "Your PlayerIQ role does not permit this action." });
      }
      if (req.method === "POST" && req.path.toLowerCase().replace(/\/$/, "") === "/uploads") {
        try {
          authorizeScope(req, req.get("x-playeriq-organization-id"), req.get("x-playeriq-player-id"));
        } catch (error) { return next(error); }
      }
      next();
    }
  };
}
