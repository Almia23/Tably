import "next-auth";
import "next-auth/jwt";

// Module augmentation: add `id` to the session user + JWT token, since
// NextAuth's default types don't include it (we use JWT sessions, see
// src/lib/auth.ts).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}
