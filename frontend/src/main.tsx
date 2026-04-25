import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/noto-sans-sc/index.css";
import App from "./App";
import { AppToaster } from "./components/AppToaster";
import { SettingsProvider } from "./lib/settings";
import { PreferencesProvider } from "./lib/preferences";
import { TooltipProvider } from "./components/ui/tooltip";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <PreferencesProvider>
          <TooltipProvider delayDuration={150}>
            <BrowserRouter
              future={{
                v7_relativeSplatPath: true,
                v7_startTransition: true,
              }}
            >
              <App />
            </BrowserRouter>
          </TooltipProvider>
          <AppToaster />
        </PreferencesProvider>
      </SettingsProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
