import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../components/ToastProvider";
import { SettingsProvider, type AppSettings } from "../lib/settings";

export function renderWithApp(
  ui: ReactNode,
  {
    route = "/",
    settings = {
      apiBaseUrl: "http://localhost:8080",
      bearerToken: "dev-token",
    },
  }: {
    route?: string;
    settings?: AppSettings;
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
        <ToastProvider>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </ToastProvider>
      </SettingsProvider>
    </QueryClientProvider>,
  );
}
