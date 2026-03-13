import { createContext, useContext } from "react";

export type SessionUser = {
  id: string;
  email: string;
  display_name: string | null;
  status: "active" | "disabled" | "deleted";
  created_at: string;
};

export type AuthState =
  | { status: "booting" }
  | { status: "signedOut" }
  | { status: "signedIn"; accessToken: string; user: SessionUser };

export type PendingSignupState =
  | { status: "requested"; email: string }
  | { status: "confirmed"; email: string }
  | null;

export type PasswordRecoveryState =
  | {
      email: string | null;
    }
  | null;

export type AuthContextValue = {
  state: AuthState;
  pendingSignup: PendingSignupState;
  passwordRecovery: PasswordRecoveryState;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  completePasswordReset: (password: string) => Promise<void>;
  cancelPasswordRecovery: () => Promise<void>;
  clearPendingSignup: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("AuthContext is not available");
  }
  return context;
}
