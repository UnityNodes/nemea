import { SignJWT, jwtVerify } from "jose";
import type { Request, Response } from "express";

export const SESSION_COOKIE = "nemea_session";
const MAX_AGE_SECONDS = 30 * 24 * 3600;

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export class SessionManager {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly secureCookies: boolean,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  async issue(res: Response, userId: string): Promise<void> {
    const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime(`${MAX_AGE_SECONDS}s`).sign(this.key);
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: this.secureCookies, maxAge: MAX_AGE_SECONDS * 1000, path: "/" });
  }

  clear(res: Response): void {
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: this.secureCookies, path: "/" });
  }

  async userIdFrom(req: Request): Promise<string | null> {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ["HS256"] });
      return typeof payload.sub === "string" ? payload.sub : null;
    } catch {
      return null;
    }
  }
}
