import { createContext, startTransition, useContext, useEffect, useState } from "react";

import { fetchSession, login as loginRequest, logout as logoutRequest } from "./authClient";
import type { SessionUser } from "./types";

type AuthStatus = "authenticated" | "guest" | "loading";

interface AuthContextValue {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  status: AuthStatus;
  user: SessionUser | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);

  async function refreshSession() {
    startTransition(() => {
      setStatus("loading");
    });

    try {
      const sessionUser = await fetchSession();

      if (sessionUser) {
        setUser(sessionUser);
        setStatus("authenticated");
        return;
      }

      setUser(null);
      setStatus("guest");
    } catch {
      setUser(null);
      setStatus("guest");
    }
  }

  async function login(email: string, password: string) {
    const result = await loginRequest(email, password);
    setUser(result.user);
    setStatus("authenticated");
  }

  async function logout() {
    await logoutRequest();
    setUser(null);
    setStatus("guest");
  }

  useEffect(() => {
    void refreshSession();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        login,
        logout,
        refreshSession,
        status,
        user
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}