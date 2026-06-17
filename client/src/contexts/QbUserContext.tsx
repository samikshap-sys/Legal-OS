/**
 * QbUserContext — provides the logged-in QueryBee Google user across all QB pages.
 *
 * Usage:
 *   const { qbUser, qbLoading, refetchQbUser } = useQbUser();
 *
 * qbUser is null when not logged in.
 * qbUser.email is always @gofynd.com (enforced server-side).
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface QbUser {
  email: string;
  name: string;
  googleId: string;
}

interface QbUserContextValue {
  qbUser: QbUser | null;
  qbLoading: boolean;
  refetchQbUser: () => Promise<void>;
  qbLogout: () => Promise<void>;
}

const QbUserContext = createContext<QbUserContextValue>({
  qbUser: null,
  qbLoading: true,
  refetchQbUser: async () => {},
  qbLogout: async () => {},
});

export function QbUserProvider({ children }: { children: React.ReactNode }) {
  const [qbUser, setQbUser] = useState<QbUser | null>(null);
  const [qbLoading, setQbLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/qb/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setQbUser(data.user ?? null);
      } else {
        setQbUser(null);
      }
    } catch {
      setQbUser(null);
    } finally {
      setQbLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const qbLogout = useCallback(async () => {
    await fetch("/api/qb/auth/logout", { method: "POST", credentials: "include" });
    setQbUser(null);
  }, []);

  return (
    <QbUserContext.Provider value={{ qbUser, qbLoading, refetchQbUser: fetchUser, qbLogout }}>
      {children}
    </QbUserContext.Provider>
  );
}

export function useQbUser() {
  return useContext(QbUserContext);
}
