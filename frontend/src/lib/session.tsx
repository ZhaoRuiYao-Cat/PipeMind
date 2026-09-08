"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { API_BASE } from "./api";

type SessionStatus = "checking" | "authenticated" | "anonymous";

interface SessionUser {
  id: number;
  username: string;
}

interface SessionValue {
  status: SessionStatus;
  user: SessionUser | null;
  updateUser: (user: SessionUser) => void;
}

interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
}

const INITIAL_SESSION: SessionValue = {
  status: "checking",
  user: null,
  updateUser: () => {
    void 0;
  },
};

const SessionContext = createContext<SessionValue>(INITIAL_SESSION);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({
    status: "checking",
    user: null,
  });

  const updateUser = (user: SessionUser): void => {
    setSession({
      status: "authenticated",
      user,
    });
  };

  useEffect(() => {
    let cancelled = false;
    const resolveSession = async (): Promise<void> => {
      let status: "authenticated" | "anonymous" = "anonymous";
      let user: { id: number; username: string } | null = null;
      try {
        let response = await fetch(`${API_BASE}/auth/me`, {
          credentials: "include",
        });
        if (response.status === 401) {
          const refreshed = await fetch(`${API_BASE}/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          });
          if (refreshed.ok) {
            response = await fetch(`${API_BASE}/auth/me`, {
              credentials: "include",
            });
          }
        }
        if (response.ok) {
          const data = (await response.json()) as {
            user?: { id: number; username: string };
          };
          if (data.user) {
            status = "authenticated";
            user = data.user;
          }
        }
      } catch {
        void 0;
      }
      if (!cancelled) {
        setSession({ status, user });
      }
    };
    void resolveSession();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SessionContext.Provider value={{ ...session, updateUser }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  return useContext(SessionContext);
}

function FullscreenLoading() {
  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--pm-color-page-bg)",
      }}
    >
      <CircularProgress
        size={48}
        thickness={4}
        sx={{ color: "var(--pm-color-primary)" }}
      />
    </Box>
  );
}

export function AuthRouteGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();

  useEffect(() => {
    if (status === "authenticated" && pathname === "/") {
      router.replace("/home");
    }
  }, [status, pathname, router]);

  useEffect(() => {
    if (status === "anonymous" && pathname !== "/") {
      router.replace("/");
    }
  }, [status, pathname, router]);

  if (pathname === "/") {
    if (status === "authenticated") {
      return <FullscreenLoading />;
    }
    return children;
  }
  if (status === "authenticated") {
    return children;
  }
  return <FullscreenLoading />;
}
