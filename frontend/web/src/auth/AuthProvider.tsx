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

const AUTH_STORAGE_KEY = "cmsfleet.auth.user";
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => readStoredUser());
  const [status, setStatus] = useState<AuthStatus>(() => (readStoredUser() ? "authenticated" : "loading"));

  async function refreshSession() {
    if (!user) {
      startTransition(() => {
        setStatus("loading");
      });
    }

    try {
      const sessionUser = await fetchSession();

      if (sessionUser) {
        persistUser(sessionUser);
        setUser(sessionUser);
        setStatus("authenticated");
        return;
      }

      clearStoredUser();
      setUser(null);
      setStatus("guest");
    } catch {
      if (user) {
        setStatus("authenticated");
        return;
      }

      clearStoredUser();
      setUser(null);
      setStatus("guest");
    }
  }

  async function login(email: string, password: string) {
    const result = await loginRequest(email, password);
    persistUser(result.user);
    setUser(result.user);
    setStatus("authenticated");
  }

  async function logout() {
    await logoutRequest();
    clearStoredUser();
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

function clearStoredUser(): void {
  const storage = getSessionStorage();

  if (!storage) {
    return;
  }

  try {
    storage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    return;
  }
}

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function persistUser(user: SessionUser): void {
  const storage = getSessionStorage();

  if (!storage) {
    return;
  }

  try {
    storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } catch {
    return;
  }
}

function readStoredUser(): SessionUser | null {
  const storage = getSessionStorage();

  if (!storage) {
    return null;
  }

  try {
    const rawValue = storage.getItem(AUTH_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as unknown;
    return isSessionUser(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isSessionUser(value: unknown): value is SessionUser {
  return typeof value === "object"
    && value !== null
    && typeof (value as SessionUser).id === "string"
    && typeof (value as SessionUser).email === "string"
    && Array.isArray((value as SessionUser).permissions)
    && typeof (value as SessionUser).role === "string";
}
