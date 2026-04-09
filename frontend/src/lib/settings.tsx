import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface AppSettings {
  apiBaseUrl: string;
  bearerToken: string;
}

interface SettingsContextValue {
  settings: AppSettings;
  saveSettings: (settings: AppSettings) => void;
}

const storageKey = "light-oss-settings";

const defaultSettings: AppSettings = {
  apiBaseUrl:
    import.meta.env.VITE_DEFAULT_API_BASE_URL ?? "http://localhost:8080",
  bearerToken: import.meta.env.VITE_DEFAULT_BEARER_TOKEN ?? "light-oss",
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({
  children,
  initialSettings,
}: {
  children: ReactNode;
  initialSettings?: AppSettings;
}) {
  const [settings, setSettings] = useState<AppSettings>(
    () => initialSettings ?? loadSettings(),
  );

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(settings));
  }, [settings]);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        saveSettings: setSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useAppSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useAppSettings must be used within SettingsProvider");
  }

  return context;
}

function loadSettings(): AppSettings {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return defaultSettings;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      apiBaseUrl: parsed.apiBaseUrl ?? defaultSettings.apiBaseUrl,
      bearerToken: parsed.bearerToken ?? defaultSettings.bearerToken,
    };
  } catch {
    return defaultSettings;
  }
}
