import crypto from "crypto";

export function generateToken(length = 12): string {
  return crypto.randomBytes(length).toString("base64url").slice(0, length);
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
