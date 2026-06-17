/**
 * LcUserContext — provides the logged-in Legal Connect Google user across all LC pages.
 *
 * Usage:
 *   const { lcUser, lcLoading, refetchLcUser, lcLogout } = useLcUser();
 *
 * lcUser is null when not logged in.
 * lcUser.email is always @gofynd.com (enforced server-side).
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface LcUser {
  email: string;
  name: string;
  googleId: string;
}

interface LcUserContextValue {
  lcUser: LcUser | null;
  lcLoading: boolean;
  refetchLcUser: () => Promise<void>;
  lcLogout: () => Promise<void>;
}

const LcUserContext = createContext<LcUserContextValue>({
  lcUser: null,
  lcLoading: true,
  refetchLcUser: async () => {},
  lcLogout: async () => {},
});

export function LcUserProvider({ children }: { children: React.ReactNode }) {
  const [lcUser, setLcUser] = useState<LcUser | null>(null);
  const [lcLoading, setLcLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/lc/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setLcUser(data.user ?? null);
      } else {
        setLcUser(null);
      }
    } catch {
      setLcUser(null);
    } finally {
      setLcLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const lcLogout = useCallback(async () => {
    await fetch("/api/lc/auth/logout", { method: "POST", credentials: "include" });
    setLcUser(null);
  }, []);

  return (
    <LcUserContext.Provider value={{ lcUser, lcLoading, refetchLcUser: fetchUser, lcLogout }}>
      {children}
    </LcUserContext.Provider>
  );
}

export function useLcUser() {
  return useContext(LcUserContext);
}
