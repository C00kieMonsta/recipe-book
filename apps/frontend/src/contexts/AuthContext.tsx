import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, getToken, isTokenPersisted, setToken as storeToken } from "@/lib/api";
import { AUTH_REFRESH_INTERVAL_MS, shouldRefresh, tokenInfo } from "@/lib/auth-token";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  // remember keeps the token in localStorage for 30 days so the phone stays signed in.
  login: (email: string, password: string, remember?: boolean) => Promise<boolean>;
  logout: () => void;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getToken());
  const inflight = useRef<Promise<void> | null>(null);

  const login = async (email: string, password: string, remember = false): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/admin/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, remember }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      if (!data.token) return false;

      storeToken(data.token, remember);
      setToken(data.token);
      return true;
    } catch {
      return false;
    }
  };

  const logout = () => {
    storeToken(null);
    setToken(null);
  };

  // Single flight: concurrent callers share one request. The new token keeps the storage class of the old one.
  const refreshToken = useCallback((): Promise<void> => {
    if (inflight.current) return inflight.current;
    const run = (async () => {
      const persisted = isTokenPersisted();
      const data = await api.auth.refresh();
      if (!data.token || data.token === getToken()) return;
      storeToken(data.token, persisted);
      setToken(data.token);
    })();
    inflight.current = run.finally(() => { inflight.current = null; });
    return inflight.current;
  }, []);

  // Keyed on being signed in, not on the token value, so a refreshed token does not restart the scheduler.
  const isAuthenticated = !!token;
  useEffect(() => {
    if (!isAuthenticated) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (navigator.onLine === false) return;
      if (!shouldRefresh(tokenInfo(getToken()), Date.now())) return;
      // A 401 already sent the browser to the login page; anything else waits for the next tick.
      refreshToken().catch(() => {});
    };
    tick();
    const onVisibility = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", tick);
    const timer = window.setInterval(tick, AUTH_REFRESH_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", tick);
      window.clearInterval(timer);
    };
  }, [isAuthenticated, refreshToken]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, token, login, logout, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
