import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

const TOKEN_TTL = "30d";

export function createAuth(secret: string) {
  const key = new TextEncoder().encode(secret);

  return {
    hashPassword: (password: string) => bcrypt.hash(password, 10),
    checkPassword: (password: string, hash: string) => bcrypt.compare(password, hash),

    signToken: (userId: string) =>
      new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime(TOKEN_TTL).sign(key),

    /** Returns the user id, or null if the token is missing, expired or forged. */
    async verifyToken(token: string): Promise<string | null> {
      try {
        const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
        return payload.sub ?? null;
      } catch {
        return null;
      }
    },
  };
}

export type Auth = ReturnType<typeof createAuth>;
