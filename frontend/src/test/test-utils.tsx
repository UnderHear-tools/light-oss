import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { AliveScope } from "react-activation";
import { AppToaster } from "../components/AppToaster";
import { PreferencesProvider, type AppPreferences } from "../lib/preferences";
import { SettingsProvider, type AppSettings } from "../lib/settings";
import { TooltipProvider } from "../components/ui/tooltip";

export function renderWithApp(
  ui: ReactNode,
  {
    route = "/",
    settings = {
      apiBaseUrl: "http://localhost:8080",
      bearerToken: "dev-token",
    },
    preferences = {
      locale: "en-US",
      theme: "light",
    },
  }: {
    route?: string;
    settings?: AppSettings;
    preferences?: AppPreferences;
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsProvider initialSettings={settings}>
        <PreferencesProvider initialPreferences={preferences}>
          <TooltipProvider delayDuration={0}>
            <MemoryRouter
              future={{
                v7_relativeSplatPath: true,
                v7_startTransition: true,
              }}
              initialEntries={[route]}
            >
              <AliveScope>{ui}</AliveScope>
            </MemoryRouter>
          </TooltipProvider>
          <AppToaster />
        </PreferencesProvider>
      </SettingsProvider>
    </QueryClientProvider>,
  );
}
