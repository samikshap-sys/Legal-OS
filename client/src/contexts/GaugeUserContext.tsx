/**
 * GaugeUserContext — provides the logged-in Gauge Google user across all Gauge pages.
 *
 * Usage:
 *   const { gaugeUser, gaugeLoading, refetchGaugeUser, gaugeLogout } = useGaugeUser();
 *
 * gaugeUser is null when not logged in.
 * gaugeUser.email is always @gofynd.com (enforced server-side).
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface GaugeUser {
  email: string;
  name: string;
  googleId: string;
  isAdmin: boolean;
}

interface GaugeUserContextValue {
  gaugeUser: GaugeUser | null;
  gaugeLoading: boolean;
  refetchGaugeUser: () => Promise<void>;
  gaugeLogout: () => Promise<void>;
}

const GaugeUserContext = createContext<GaugeUserContextValue>({
  gaugeUser: null,
  gaugeLoading: true,
  refetchGaugeUser: async () => {},
  gaugeLogout: async () => {},
});

export function GaugeUserProvider({ children }: { children: React.ReactNode }) {
  const [gaugeUser, setGaugeUser] = useState<GaugeUser | null>(null);
  const [gaugeLoading, setGaugeLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/gauge/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setGaugeUser(data.user ?? null);
      } else {
        setGaugeUser(null);
      }
    } catch {
      setGaugeUser(null);
    } finally {
      setGaugeLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const gaugeLogout = useCallback(async () => {
    await fetch("/api/gauge/auth/logout", { method: "POST", credentials: "include" });
    setGaugeUser(null);
  }, []);

  return (
    <GaugeUserContext.Provider value={{ gaugeUser, gaugeLoading, refetchGaugeUser: fetchUser, gaugeLogout }}>
      {children}
    </GaugeUserContext.Provider>
  );
}

export function useGaugeUser() {
  return useContext(GaugeUserContext);
}
