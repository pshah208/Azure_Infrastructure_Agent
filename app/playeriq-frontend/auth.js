(() => {
  const P = window.PlayerIQ;
  if (!P) return;
  const $ = (id) => document.getElementById(id);
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const loopback = (host) => ["localhost", "127.0.0.1", "[::1]"].includes(host);
  const knownRoles = ["PlayerIQ.Admin", "PlayerIQ.Coach", "PlayerIQ.Viewer"];
  const returnKey = "playeriq-auth-return";
  let state = { phase: "loading", message: "Authorization has not been loaded.", identity: null, mode: null, apiUrl: null };
  let epoch = 0;
  let instance = null;
  let account = null;
  let config = null;
  let binding = null;
  let bootstrap = null;
  let redirecting = false;

  // Redirect URIs are query-free registered page URLs. Restore only same-page,
  // non-token context before the application reads its query fields.
  try {
    if (/(?:^#|&)(?:code|error)=/.test(location.hash)) {
      const saved = new URL(sessionStorage.getItem(returnKey));
      if (saved.origin === location.origin && saved.pathname === location.pathname) {
        const restored = new URL(location.href);
        ["apiUrl", "organizationId", "playerId", "matchId", "scoutTheme"].forEach((key) => {
          if (saved.searchParams.has(key)) restored.searchParams.set(key, saved.searchParams.get(key));
        });
        history.replaceState(null, "", restored);
      }
      sessionStorage.removeItem(returnKey);
    }
  } catch { /* Invalid context is never used as an authority or redirect target. */ }

  const permission = (name) => {
    if (state.phase !== "ready" || state.identity?.permissions?.[name] !== true) return false;
    const roles = state.identity.roles;
    return roles.includes("PlayerIQ.Admin") ||
      (name !== "admin" && roles.includes("PlayerIQ.Coach")) ||
      (name === "read" && roles.includes("PlayerIQ.Viewer"));
  };
  const can = (name, scope) => {
    if (!permission(name)) return false;
    if (!scope) return true;
    if (scope.apiUrl && P.apiBase(scope.apiUrl) !== state.apiUrl) return false;
    return state.identity.memberships.some((membership) =>
      membership.organizationId === scope.organizationId &&
      (!scope.playerId || membership.playerIds.includes("*") || membership.playerIds.includes(scope.playerId)));
  };
  const assert = (name, scope) => {
    if (!can(name, scope)) throw new Error(state.phase === "ready"
      ? `Access denied: ${name} permission and an organization/player membership are required. Ask an administrator for access.`
      : "Sign in and load authorization before accessing PlayerIQ data.");
  };
  const getEpoch = () => epoch;
  const validateEpoch = (expected) => {
    if (expected !== epoch) throw new Error("Authorization changed. Previous-account data was discarded; sign in or reload access.");
  };
  const configuredUrl = (value) => {
    const url = new URL(P.trustedApiOrigin(value));
    if (url.pathname !== "/" || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback(url.hostname)))) {
      throw new Error("Use an HTTPS API origin, or HTTP on loopback for local testing. API paths are not accepted.");
    }
    return url.origin;
  };
  const checkOrigin = (value) => {
    const url = new URL(value);
    P.trustedApiOrigin(url.origin);
    if (!state.apiUrl || url.origin !== state.apiUrl || url.username || url.password) {
      throw new Error("Blocked request: tokens can only be sent to the explicitly configured API origin.");
    }
    return url;
  };
  const text = (id, value) => { if ($(id)) $(id).textContent = value; };
  const scopeFromInputs = () => ({ apiUrl: state.apiUrl, organizationId: $("organization-id")?.value.trim(), playerId: $("player-id")?.value.trim() });
  const applyControls = (busy = binding?.busy?.() || false) => {
    const controls = {
      "upload-analysis-button": "upload", "video-file": "upload", "match-name": "upload",
      "sample-button": "admin", "recheck-button": "read", "new-upload-button": "upload",
      "load-history": "read", "load-more": "read", "refresh-detail": "read",
      "save-review": "review"
    };
    Object.entries(controls).forEach(([id, required]) => {
      const node = $(id);
      if (!node) return;
      node.disabled = busy || !can(required, scopeFromInputs());
      if (["upload-analysis-button", "sample-button", "save-review"].includes(id)) node.hidden = !permission(required);
    });
    ["organization-id", "player-id"].forEach((id) => { if ($(id)) $(id).disabled = busy || state.phase !== "ready"; });
    if ($("reviewer")) {
      $("reviewer").readOnly = true;
      $("reviewer").value = state.identity?.name || "";
    }
    if ($("review-fields") && !permission("review")) $("review-fields").disabled = true;
  };
  const constrainInputs = () => {
    if (state.phase !== "ready") return;
    const org = $("organization-id"), player = $("player-id");
    if (!org || !player) return;
    if (state.mode === "local-mock") {
      org.readOnly = false;
      player.readOnly = false;
      org.removeAttribute("list");
      player.removeAttribute("list");
      state.identity.memberships = org.value.trim()
        ? [{ organizationId: org.value.trim(), playerIds: ["*"] }] : [];
      return;
    }
    const memberships = state.identity.memberships;
    const orgs = [...new Set(memberships.map((item) => item.organizationId))];
    if (!orgs.includes(org.value)) org.value = orgs[0];
    const players = [...new Set(memberships.filter((item) => item.organizationId === org.value).flatMap((item) => item.playerIds))];
    const datalist = (input, items, id) => {
      let options = $(id);
      if (!options) { options = P.el("datalist"); options.id = id; input.after(options); }
      options.replaceChildren(...items.map((value) => { const option = P.el("option"); option.value = value; return option; }));
      input.setAttribute("list", id);
    };
    org.readOnly = orgs.length === 1;
    datalist(org, orgs, "authorized-organizations");
    player.readOnly = !players.includes("*") && players.length === 1;
    if (!players.includes("*") && !players.includes(player.value)) player.value = players[0];
    datalist(player, players.filter((value) => value !== "*"), "authorized-players");
  };
  const paint = () => {
    text("auth-status", state.message);
    text("auth-identity", state.identity
      ? `${state.identity.name} · ${state.identity.roles.join(", ")} · ${state.mode === "entra" ? "Entra-verified identity" : "LOCAL MOCK — identity is not verified"}`
      : "No authorized identity loaded.");
    if ($("auth-signin")) {
      $("auth-signin").hidden = !config?.enabled;
      $("auth-signin").disabled = state.phase === "loading" || redirecting;
      $("auth-signin").textContent = state.phase === "ready" ? "Switch account" : "Sign in with Microsoft";
    }
    if ($("auth-signout")) $("auth-signout").hidden = !account && state.phase !== "ready";
    if ($("auth-retry")) $("auth-retry").disabled = state.phase === "loading" || redirecting;
    applyControls();
  };
  const publish = (next, clear = false) => {
    state = { ...state, ...next };
    if (clear) {
      epoch++;
      P.releaseAllMedia?.();
      binding?.clear?.();
    }
    paint();
    window.dispatchEvent(new CustomEvent("playeriq:authchange", { detail: { phase: state.phase } }));
  };
  const verifyAccount = () => {
    if (state.mode === "entra" && state.phase === "ready" &&
      instance?.getActiveAccount()?.homeAccountId !== account?.homeAccountId) {
      publish({ phase: "signed-out", identity: null, message: "The active Microsoft account changed. Sign in again to reload access." }, true);
      throw new Error(state.message);
    }
  };
  const interactionRequired = (error) => error instanceof (window.msal?.InteractionRequiredAuthError || Error) ||
    /interaction_required|login_required|consent_required|no_tokens_found|invalid_grant/i.test(error?.errorCode || "");
  const acquireToken = async () => {
    if (!instance || !account || !config?.enabled) throw new Error("Sign in with Microsoft to continue.");
    verifyAccount();
    const current = epoch;
    let timer;
    try {
      const result = await Promise.race([
        instance.acquireTokenSilent({ scopes: [config.scope], account }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Token acquisition timed out.")), 30000);
        })
      ]);
      validateEpoch(current);
      if (!result.accessToken) throw new Error("The identity provider returned no API access token.");
      return result.accessToken;
    } catch (error) {
      if (current !== epoch) throw error;
      publish({ phase: "interaction-required", identity: null, message: interactionRequired(error)
        ? "Your session needs interaction. Select Sign in with Microsoft, then retry your action."
        : `Could not acquire an API token. Sign in again to retry. ${error.message || ""}` }, true);
      throw new Error(state.message);
    } finally { clearTimeout(timer); }
  };
  const authorize = async (value, options = {}) => {
    const url = checkOrigin(value);
    if (["/api/auth/config", "/health"].includes(url.pathname)) return {};
    assert("read");
    const method = (options.method || "GET").toUpperCase();
    const action = method === "GET" ? "read" : url.pathname.endsWith("/reviews") ? "review" : url.pathname === "/api/uploads" ? "upload" : "admin";
    let body = {};
    if (typeof options.body === "string") {
      try { body = JSON.parse(options.body); } catch { /* Backend validates non-JSON bodies. */ }
    }
    const headers = new Headers(options.headers);
    const organizationId = url.searchParams.get("organizationId") || headers.get("x-playeriq-organization-id") || body.organizationId;
    const playerRoute = /^\/api\/players\/([^/]+)\/matches$/.exec(url.pathname);
    const playerId = headers.get("x-playeriq-player-id") || body.playerId || (playerRoute ? decodeURIComponent(playerRoute[1]) : undefined);
    assert(action, organizationId ? { apiUrl: url.origin, organizationId, playerId } : undefined);
    if (state.mode === "local-mock") return {};
    const accessToken = await acquireToken();
    return { Authorization: `Bearer ${accessToken}` };
  };
  const handleHttpError = (status) => {
    if (![401, 403].includes(status)) return;
    publish({ phase: status === 401 ? "signed-out" : "forbidden", identity: null,
      message: status === 401 ? "Your session is not authorized. Sign in again, then retry."
        : "Access denied (403). Ask an administrator to grant the required role and organization/player membership, then reload access." }, true);
  };
  const fetchIdentityJson = async (url, headers = {}) => {
    checkOrigin(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, { headers, signal: controller.signal, redirect: "error", credentials: "omit", referrerPolicy: "no-referrer" });
      if (response.redirected || (response.url && new URL(response.url).origin !== new URL(url).origin)) {
        throw new Error("Blocked redirected authentication response. Check the trusted API configuration.");
      }
      if (!response.ok) {
        handleHttpError(response.status);
        throw new Error(response.status === 403 ? "Access denied (403): an administrator must grant role and membership access." : `Authentication configuration/identity request failed (HTTP ${response.status}).`);
      }
      return await response.json();
    } catch (error) {
      if (error.name === "AbortError") throw new Error("Authentication request timed out. Reload access to retry.");
      throw error;
    } finally { clearTimeout(timer); }
  };
  const validateIdentity = (value) => {
    if (!value || typeof value.name !== "string" || !value.name.trim() || !Array.isArray(value.roles) ||
      !value.roles.some((role) => knownRoles.includes(role)) || value.permissions?.read !== true) throw new Error("No readable PlayerIQ role was granted. Ask an administrator for access.");
    if (state.mode === "entra" && (!guid.test(value.objectId) || value.tenantId?.toLowerCase() !== config.tenantId.toLowerCase() ||
      (account.localAccountId && value.objectId.toLowerCase() !== account.localAccountId.toLowerCase()))) {
      throw new Error("The API identity does not match the signed-in tenant/account.");
    }
    const memberships = (value.memberships || []).filter((item) => typeof item.organizationId === "string" && item.organizationId.trim() &&
      Array.isArray(item.playerIds) && item.playerIds.length && item.playerIds.every((id) => typeof id === "string" && id.trim()));
    if (!memberships.length) throw new Error("No organization/player membership is granted. Ask an administrator to assign membership.");
    return { ...value, roles: value.roles.filter((role) => knownRoles.includes(role)), memberships };
  };
  const initialize = async (value) => {
    publish({ phase: "loading", identity: null, message: "Loading authentication configuration and access…", mode: null }, true);
    const current = epoch;
    config = null;
    account = null;
    instance = null;
    try {
      state.apiUrl = configuredUrl(value);
      const response = await fetchIdentityJson(`${state.apiUrl}/api/auth/config`);
      validateEpoch(current);
      if (response.enabled === false) {
        if (!loopback(location.hostname) || !loopback(new URL(state.apiUrl).hostname)) throw new Error("Local-mock authentication is only allowed when both the page and API use loopback hosts.");
        config = { enabled: false };
        state.mode = "local-mock";
      } else {
        if (response.enabled !== true || !guid.test(response.tenantId) || !guid.test(response.clientId) ||
          !/^api:\/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/access_as_user$/i.test(response.scope)) {
          throw new Error("Invalid authentication configuration. A GUID tenant/client and api://GUID/access_as_user scope are required.");
        }
        if (!window.msal?.PublicClientApplication) throw new Error("The local MSAL bundle is missing. Run npm run build and reload; access remains disabled.");
        config = response;
        state.mode = "entra";
        instance = new window.msal.PublicClientApplication({
          auth: { clientId: config.clientId, authority: `https://login.microsoftonline.com/${config.tenantId}`, redirectUri: `${location.origin}${location.pathname}`, navigateToLoginRequestUrl: false },
          cache: { cacheLocation: "sessionStorage" }
        });
        await instance.initialize();
        validateEpoch(current);
        const result = await instance.handleRedirectPromise();
        validateEpoch(current);
        const accounts = instance.getAllAccounts().filter((item) => item.tenantId?.toLowerCase() === config.tenantId.toLowerCase());
        account = result?.account || instance.getActiveAccount() || (accounts.length === 1 ? accounts[0] : null);
        if (!account || account.tenantId?.toLowerCase() !== config.tenantId.toLowerCase()) {
          account = null;
          publish({ phase: "signed-out", message: "Sign in with Microsoft to load your role and organization/player memberships." });
          return;
        }
        instance.setActiveAccount(account);
        instance.addEventCallback?.(() => {
          try { verifyAccount(); } catch { /* State is already cleared on an account change. */ }
        });
      }
      const identity = config.enabled
        ? await fetchIdentityJson(`${state.apiUrl}/api/auth/me`, { Authorization: `Bearer ${await acquireToken()}` })
        : {
          objectId: "local-mock", tenantId: "local-mock", name: "Local mock reviewer (unverified)",
          roles: ["PlayerIQ.Admin"],
          permissions: { read: true, upload: true, review: true, admin: true },
          memberships: [{ organizationId: $("organization-id")?.value.trim() || "org-northshore-academy", playerIds: ["*"] }]
        };
      validateEpoch(current);
      const validated = validateIdentity(identity);
      publish({ phase: "ready", identity: validated, message: state.mode === "entra"
        ? "Signed in. Server-enforced role and membership access is loaded."
        : "LOCAL MOCK MODE — no authenticated identity. Do not expose this configuration publicly." });
      constrainInputs();
      paint();
      await binding?.ready?.();
    } catch (error) {
      if (current !== epoch) return;
      publish({ phase: "error", identity: null, message: `${error.message} Access remains disabled; correct configuration or reload access.` }, true);
    }
  };
  const rememberContext = () => {
    const url = new URL(location.href);
    url.hash = "";
    url.searchParams.set("apiUrl", state.apiUrl);
    for (const [key, id] of [["organizationId", "organization-id"], ["playerId", "player-id"]]) {
      if ($(id)?.value) url.searchParams.set(key, $(id).value);
    }
    sessionStorage.setItem(returnKey, url.href);
  };
  const signIn = async () => {
    if (!instance || !config?.enabled || redirecting) return;
    redirecting = true;
    publish({ phase: "loading", identity: null, message: "Redirecting to Microsoft sign-in…" }, true);
    try {
      rememberContext();
      await instance.loginRedirect({ scopes: [config.scope], prompt: "select_account" });
    } catch (error) {
      redirecting = false;
      publish({ phase: "error", message: `Sign-in could not start: ${error.message}` }, true);
    }
  };
  const signOut = async () => {
    const previous = account;
    account = null;
    publish({ phase: "signed-out", identity: null, message: "Signed out. Previous reports and protected media have been cleared." }, true);
    try {
      if (instance && previous) await instance.logoutRedirect({ account: previous, postLogoutRedirectUri: `${location.origin}${location.pathname}` });
    } catch (error) { publish({ message: `Local data cleared. Microsoft sign-out did not complete: ${error.message}. Close this tab if needed.` }); }
  };
  const bind = (callbacks) => {
    binding = callbacks;
    const panel = $("auth-panel");
    if (panel) {
      panel.replaceChildren();
      const title = P.el("h2", "Account & access");
      const identity = P.el("p"); identity.id = "auth-identity";
      const status = P.el("p"); status.id = "auth-status"; status.setAttribute("role", "status");
      const actions = P.el("div", undefined, "actions");
      for (const [id, caption, handler] of [["auth-signin", "Sign in with Microsoft", signIn], ["auth-signout", "Sign out", signOut], ["auth-retry", "Reload access", () => initialize($("api-url").value)]]) {
        const button = P.el("button", caption, "button secondary"); button.id = id; button.type = "button";
        button.addEventListener("click", handler); actions.append(button);
      }
      panel.append(title, identity, status, actions);
    }
    $("api-url")?.addEventListener("input", () => {
      config = null;
      publish({ phase: "error", identity: null, message: "API URL changed. Select Reload access to authenticate against the new origin." }, true);
    });
    ["organization-id", "player-id"].forEach((id) => $(id)?.addEventListener("change", () => {
      constrainInputs();
      applyControls();
    }));
    window.addEventListener("focus", () => { try { verifyAccount(); } catch { /* Sign-in UI explains the change. */ } });
    paint();
    bootstrap = initialize($("api-url").value);
    return bootstrap;
  };
  window.PlayerIQAuth = { bind, initialize, can, assert, authorize, getEpoch, validateEpoch, handleHttpError, applyControls, signIn, signOut,
    get state() { return state; }, get ready() { return bootstrap; } };
})();
