import crypto from "node:crypto";

export const SESSION_COOKIE_NAME = "cmp_session";

/**
 * Generates a cryptographically strong 256-bit hex session token.
 */
export function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Masks an API key so plaintext secrets are never exposed to browsers, logs, or MCP outputs.
 */
export function maskApiKey(rawKey) {
  const k = String(rawKey || "").trim();
  if (!k) return "";
  if (k.length <= 8) return "••••••••";
  const prefix = k.slice(0, Math.min(4, k.indexOf("-") > 0 ? k.indexOf("-") + 1 : 3));
  const suffix = k.slice(-4);
  return `${prefix}••••${suffix}`;
}

/**
 * Constant-time string comparison to prevent timing side channels.
 */
export function safeTokenEqual(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Parses an HTTP Cookie header into a key/value object.
 */
export function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader || typeof cookieHeader !== "string") return out;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

/**
 * Builds an HttpOnly, SameSite=Strict loopback session cookie.
 */
export function buildSessionCookie(token) {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/`;
}

/**
 * Verifies loopback Host, Origin (anti-CSRF / anti-DNS-rebinding), and session token.
 */
export function verifyLoopbackAuth(req, expectedToken, options = {}) {
  const allowedPort = options.port ? String(options.port) : null;
  const hostHeader = String(req.headers?.host || "").trim().toLowerCase();

  if (hostHeader) {
    const validHosts = allowedPort
      ? new Set([`127.0.0.1:${allowedPort}`, `localhost:${allowedPort}`, `[::1]:${allowedPort}`])
      : null;
    const isLoopbackHost = validHosts
      ? validHosts.has(hostHeader)
      : /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(hostHeader);
    if (!isLoopbackHost) {
      return { ok: false, status: 403, reason: "Invalid Host header (loopback required)" };
    }
  }

  const originHeader = String(req.headers?.origin || "").trim().toLowerCase();
  if (originHeader) {
    let validOrigin = false;
    try {
      const u = new URL(originHeader);
      const isLoopbackOrigin =
        u.protocol === "http:" &&
        (u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "[::1]") &&
        (!allowedPort || u.port === allowedPort);
      validOrigin = isLoopbackOrigin;
    } catch {
      validOrigin = false;
    }
    if (!validOrigin) {
      return { ok: false, status: 403, reason: "Cross-origin request forbidden" };
    }
  }

  const headerToken = String(req.headers?.["x-cmp-token"] || "").trim();
  const authHeader = String(req.headers?.authorization || "").trim();
  const bearerToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const cookies = parseCookies(req.headers?.cookie || "");
  const cookieToken = String(cookies[SESSION_COOKIE_NAME] || "").trim();

  let queryToken = "";
  if (options.allowQueryToken) {
    try {
      const u = new URL(req.url || "/", "http://127.0.0.1");
      queryToken = String(u.searchParams.get("token") || "").trim();
    } catch {
      queryToken = "";
    }
  }

  const candidate = headerToken || bearerToken || cookieToken || queryToken;
  if (!candidate || !safeTokenEqual(candidate, expectedToken)) {
    return { ok: false, status: 401, reason: "Missing or invalid dashboard authentication token" };
  }

  return {
    ok: true,
    status: 200,
    usedQueryToken: Boolean(!headerToken && !bearerToken && !cookieToken && queryToken)
  };
}
