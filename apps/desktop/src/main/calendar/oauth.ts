/**
 * OAuth para apps de escritorio: abre el navegador del sistema y recibe el código
 * en un servidor local temporal (redirect "loopback"), con PKCE.
 */
import http from "node:http";
import { randomBytes, createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import { shell } from "electron";

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope?: string;
  id_token?: string;
}

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

const PAGE = (ok: boolean, msg: string) => `<!doctype html><html lang="es"><meta charset="utf-8"><title>Lumi</title>
<body style="font-family:system-ui,sans-serif;background:#33375A;color:#fff;display:grid;place-items:center;height:100vh;margin:0">
<div style="background:#fff;color:#1E2033;border-radius:20px;padding:32px 40px;max-width:420px;text-align:center">
<h1 style="margin:0 0 8px;font-size:22px">${ok ? "¡Listo!" : "Algo salió mal"}</h1><p style="margin:0;line-height:1.5">${msg}</p></div></body></html>`;

export interface LoopbackServer {
  redirectUri: string;
  waitForCode(expectedState?: string, timeoutMs?: number): Promise<string>;
  close(): void;
}

/** Abre un servidor en 127.0.0.1 (o localhost) para recibir el código. */
export async function startLoopback(opts: { host?: "127.0.0.1" | "localhost"; port?: number; path?: string } = {}): Promise<LoopbackServer> {
  const host = opts.host ?? "127.0.0.1";
  const pathName = opts.path ?? "/callback";
  let resolveCode: (c: string) => void = () => {};
  let rejectCode: (e: Error) => void = () => {};
  let expected: string | undefined;
  const got = new Promise<string>((res, rej) => {
    resolveCode = res;
    rejectCode = rej;
  });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}`);
    if (url.pathname !== pathName) {
      res.writeHead(404).end();
      return;
    }
    const code = url.searchParams.get("code");
    const err = url.searchParams.get("error");
    const state = url.searchParams.get("state");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    if (err || !code || (expected && state !== expected)) {
      res.end(PAGE(false, "No se pudo completar la conexión. Vuelve a Lumi e inténtalo otra vez."));
      rejectCode(new Error(err ? `Autorización rechazada: ${err}` : "Respuesta inválida del proveedor"));
    } else {
      res.end(PAGE(true, "Lumi ya quedó conectado. Puedes cerrar esta pestaña y volver."));
      resolveCode(code);
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, "127.0.0.1", () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  return {
    redirectUri: `http://${host}:${port}${pathName}`,
    waitForCode(expectedState, timeoutMs = 5 * 60_000) {
      expected = expectedState;
      const timer = setTimeout(() => rejectCode(new Error("Se agotó el tiempo para conectar (5 min).")), timeoutMs);
      return got.finally(() => {
        clearTimeout(timer);
        setTimeout(() => server.close(), 500);
      });
    },
    close: () => server.close(),
  };
}

export async function tokenRequest(url: string, body: Record<string, string>): Promise<OAuthTokens> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== "string") {
    throw new Error(`No se pudo obtener el acceso: ${String(json.error_description ?? json.error ?? res.status)}`);
  }
  return {
    access_token: json.access_token,
    refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    expires_at: Date.now() + (Number(json.expires_in ?? 3600) - 60) * 1000,
    scope: typeof json.scope === "string" ? json.scope : undefined,
    id_token: typeof json.id_token === "string" ? json.id_token : undefined,
  };
}

/** Flujo completo: abrir navegador → esperar código → canjear por tokens. */
export async function authorizeInBrowser(opts: {
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  scope: string;
  host?: "127.0.0.1" | "localhost";
  extraAuthParams?: Record<string, string>;
}): Promise<OAuthTokens> {
  const loop = await startLoopback({ host: opts.host });
  const { verifier, challenge } = pkcePair();
  const state = b64url(randomBytes(16));
  const url = new URL(opts.authUrl);
  const params: Record<string, string> = {
    client_id: opts.clientId,
    redirect_uri: loop.redirectUri,
    response_type: "code",
    scope: opts.scope,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    ...opts.extraAuthParams,
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  await shell.openExternal(url.toString());
  const code = await loop.waitForCode(state);
  return tokenRequest(opts.tokenUrl, {
    grant_type: "authorization_code",
    code,
    redirect_uri: loop.redirectUri,
    client_id: opts.clientId,
    code_verifier: verifier,
    ...(opts.clientSecret ? { client_secret: opts.clientSecret } : {}),
  });
}

export async function refreshTokens(tokenUrl: string, clientId: string, refreshToken: string, clientSecret?: string, scope?: string): Promise<OAuthTokens> {
  const t = await tokenRequest(tokenUrl, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
    ...(scope ? { scope } : {}),
  });
  return { ...t, refresh_token: t.refresh_token ?? refreshToken };
}

export function decodeJwtEmail(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return payload.email ?? payload.preferred_username ?? null;
  } catch {
    return null;
  }
}
