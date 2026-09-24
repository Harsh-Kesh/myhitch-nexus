"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { BootSplash } from "@/components/layout/boot-splash";
import { NetworkStatus } from "@/components/layout/network-status";
import { ToastProvider } from "@/components/ui/toast";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue>({
  theme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
});

export const useTheme = () => React.useContext(ThemeContext);

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("light");

  React.useEffect(() => {
    const stored = window.localStorage.getItem("nexus-theme-v2") as Theme | null;
    if (stored === "light" || stored === "dark") {
      setThemeState(stored);
    } else {
      setThemeState("light");
      document.documentElement.dataset.theme = "light";
    }
  }, []);

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("nexus-theme-v2", theme);
  }, [theme]);

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: setThemeState,
      toggleTheme: () =>
        setThemeState((current) => (current === "dark" ? "light" : "dark")),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

import { UploadProvider } from "@/components/upload/upload-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The mock layer is in-memory: refetching on focus just causes
            // flicker, and retries would mask genuine bugs in the fixtures.
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <ToastProvider>
          <UploadProvider>
            {/* NetworkStatus sits inside the query provider so a reconnect can
                refetch, and outside the page so it can replace it when offline. */}
            <NetworkStatus>{children}</NetworkStatus>
            <BootSplash />
          </UploadProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
