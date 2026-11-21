import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const citizenPrefix = "cit_";
const citizenTokenPattern = /^cit_[A-Za-z0-9_-]{43}$/;
const hashPattern = /^[0-9a-f]{64}$/;

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function readBearerToken(headers: Headers): string | null {
  const value = headers.get("authorization");
  if (!value || value.length > 1_031) return null;
  return /^Bearer +([A-Za-z0-9._~+/\-]+=*)$/i.exec(value)?.[1] ?? null;
}

export function issueCitizenToken(): { token: string; tokenHash: string } {
  const token = citizenPrefix + randomBytes(32).toString("base64url");
  return { token, tokenHash: digest(token).toString("hex") };
}

export function canAccessCitizenSession(headers: Headers, citizenTokenHash: string): boolean {
  const token = readBearerToken(headers);
  return !!token && citizenTokenPattern.test(token) && hashPattern.test(citizenTokenHash) &&
    timingSafeEqual(digest(token), Buffer.from(citizenTokenHash, "hex"));
}

export function getConsoleAgentId(
  headers: Headers,
  configuration: { CONSOLE_TOKEN?: string; CONSOLE_AGENT_ID?: string },
): string | null {
  const token = readBearerToken(headers);
  const configured = configuration.CONSOLE_TOKEN;
  if (!configured || !token || token.startsWith(citizenPrefix)) return null;
  if (!timingSafeEqual(digest(token), digest(configured))) return null;

  return configuration.CONSOLE_AGENT_ID?.trim() || "demo-agent-1";
}