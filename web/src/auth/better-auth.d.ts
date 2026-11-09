// The part of Better Auth's React client (better-auth/react) that the app uses; see better-auth.js.
// server/auth-client-types.ts fails to compile if Better Auth's real client no longer fits these types.

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthSession {
  session: { id: string; userId: string; token: string; expiresAt: Date; createdAt: Date; updatedAt: Date };
  user: AuthUser;
}

/** An error answer: code is Better Auth's error code, for example INVALID_EMAIL_OR_PASSWORD. */
export interface AuthError {
  code?: string | undefined;
  message?: string | undefined;
  status: number;
  statusText: string;
}

export type AuthResult<T> = Promise<{ data: T; error: null } | { data: null; error: AuthError }>;

export interface AuthClient {
  getSession(): AuthResult<AuthSession | null>;
  signUp: { email(body: { name: string; email: string; password: string }): AuthResult<unknown> };
  signIn: { email(body: { email: string; password: string }): AuthResult<unknown> };
  signOut(): AuthResult<unknown>;
}

export declare const authClient: AuthClient;
