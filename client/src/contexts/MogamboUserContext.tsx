/**
 * MogamboUserContext — provides the logged-in Mogambo Google user across all Mogambo pages.
 *
 * Usage:
 *   const { mogamboUser, mogamboLoading, refetchMogamboUser, mogamboLogout } = useMogamboUser();
 *
 * mogamboUser is null when not logged in.
 * mogamboUser.email is always @gofynd.com (enforced server-side).
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface MogamboUser {
  email: string;
  name: string;
  googleId: string;
}

interface MogamboUserContextValue {
  mogamboUser: MogamboUser | null;
  mogamboLoading: boolean;
  refetchMogamboUser: () => Promise<void>;
  mogamboLogout: () => Promise<void>;
}

const MogamboUserContext = createContext<MogamboUserContextValue>({
  mogamboUser: null,
  mogamboLoading: true,
  refetchMogamboUser: async () => {},
  mogamboLogout: async () => {},
});

export function MogamboUserProvider({ children }: { children: React.ReactNode }) {
  const [mogamboUser, setMogamboUser] = useState<MogamboUser | null>(null);
  const [mogamboLoading, setMogamboLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/mogambo/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMogamboUser(data.user ?? null);
      } else {
        setMogamboUser(null);
      }
    } catch {
      setMogamboUser(null);
    } finally {
      setMogamboLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const mogamboLogout = useCallback(async () => {
    await fetch("/api/mogambo/auth/logout", { method: "POST", credentials: "include" });
    setMogamboUser(null);
  }, []);

  return (
    <MogamboUserContext.Provider value={{ mogamboUser, mogamboLoading, refetchMogamboUser: fetchUser, mogamboLogout }}>
      {children}
    </MogamboUserContext.Provider>
  );
}

export function useMogamboUser() {
  return useContext(MogamboUserContext);
}
