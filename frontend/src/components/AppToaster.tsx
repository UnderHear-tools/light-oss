import { Toaster } from "@/components/ui/sonner";
import { useAppPreferences } from "@/lib/preferences";

export function AppToaster() {
  const {
    preferences: { theme },
  } = useAppPreferences();

  return <Toaster position="top-center" theme={theme} />;
}
