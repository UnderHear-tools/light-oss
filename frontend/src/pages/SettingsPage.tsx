import { FormEvent, useEffect, useRef, useState, type ReactNode } from "react";
import { ShieldAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { getHealthStatus } from "@/api/health";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ConnectionHealthStatus } from "@/components/ConnectionHealthStatus";
import {
  createCheckingConnectionHealthStates,
  resolveConnectionHealthStates,
  type ConnectionHealthStates,
} from "@/lib/health";
import { LocaleToggle } from "@/components/LocaleToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useI18n } from "@/lib/i18n";
import { useAppSettings } from "@/lib/settings";

export function SettingsPage() {
  const { settings, saveSettings } = useAppSettings();
  const { t } = useI18n();
  const [isBearerTokenVisible, setIsBearerTokenVisible] = useState(false);
  const [draftSettings, setDraftSettings] = useState(() => ({
    apiBaseUrl: settings.apiBaseUrl,
    bearerToken: settings.bearerToken,
  }));
  const [manualHealthStates, setManualHealthStates] =
    useState<ConnectionHealthStates | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const testRequestRef = useRef(0);

  useEffect(() => {
    setDraftSettings({
      apiBaseUrl: settings.apiBaseUrl,
      bearerToken: settings.bearerToken,
    });
  }, [settings.apiBaseUrl, settings.bearerToken]);

  function readDraftSettings() {
    return {
      apiBaseUrl: draftSettings.apiBaseUrl.trim(),
      bearerToken: draftSettings.bearerToken.trim(),
    };
  }

  function clearManualHealthStates() {
    testRequestRef.current += 1;
    setManualHealthStates(null);
    setIsTestingConnection(false);
  }

  function updateDraftSettings(
    nextDraftSettings: Partial<typeof draftSettings>,
  ) {
    clearManualHealthStates();
    setDraftSettings((current) => ({
      ...current,
      ...nextDraftSettings,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draftSettings = readDraftSettings();
    clearManualHealthStates();
    saveSettings({
      apiBaseUrl: draftSettings.apiBaseUrl,
      bearerToken: draftSettings.bearerToken,
    });
    toast.success(t("toast.settingsSaved"));
  }

  async function handleTestConnection() {
    const draftSettings = readDraftSettings();

    if (draftSettings.apiBaseUrl === "") {
      return;
    }

    const requestId = testRequestRef.current + 1;
    testRequestRef.current = requestId;
    setIsTestingConnection(true);
    setManualHealthStates(createCheckingConnectionHealthStates());

    try {
      const result = await getHealthStatus(draftSettings);
      if (testRequestRef.current !== requestId) {
        return;
      }

      setManualHealthStates(
        resolveConnectionHealthStates({
          isConfigured: true,
          isPending: false,
          error: null,
          data: result,
        }),
      );
    } catch (error) {
      if (testRequestRef.current !== requestId) {
        return;
      }

      setManualHealthStates(
        resolveConnectionHealthStates({
          isConfigured: true,
          isPending: false,
          error,
        }),
      );
    } finally {
      if (testRequestRef.current === requestId) {
        setIsTestingConnection(false);
      }
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("settings.title")}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t("settings.description")}
        </p>
      </div>

      <div className="space-y-6">
        <Card className="border-border/70 bg-card">
          <CardHeader className="gap-3 border-b">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <CardTitle>{t("settings.connection.title")}</CardTitle>
                <CardDescription>
                  {t("settings.connection.description")}
                </CardDescription>
              </div>
              <ConnectionHealthStatus
                className="justify-start lg:justify-end"
                states={manualHealthStates ?? undefined}
              />
            </div>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-5 pb-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="api-base-url">
                    {t("settings.connection.apiBaseUrl")}
                  </FieldLabel>
                  <Input
                    id="api-base-url"
                    name="apiBaseUrl"
                    onChange={(event) =>
                      updateDraftSettings({
                        apiBaseUrl: event.currentTarget.value,
                      })
                    }
                    placeholder="http://localhost:8080"
                    value={draftSettings.apiBaseUrl}
                  />
                  <FieldDescription>
                    {t("settings.connection.apiBaseUrlDescription")}
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="bearer-token">
                    {t("settings.connection.bearerToken")}
                  </FieldLabel>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Input
                        id="bearer-token"
                        name="bearerToken"
                        onChange={(event) =>
                          updateDraftSettings({
                            bearerToken: event.currentTarget.value,
                          })
                        }
                        placeholder="dev-token"
                        type={isBearerTokenVisible ? "text" : "password"}
                        value={draftSettings.bearerToken}
                      />
                    </div>
                    <Button
                      onClick={() =>
                        setIsBearerTokenVisible((current) => !current)
                      }
                      type="button"
                      variant="outline"
                    >
                      {isBearerTokenVisible
                        ? t("settings.connection.hideToken")
                        : t("settings.connection.showToken")}
                    </Button>
                  </div>
                  <FieldDescription>
                    {t("settings.connection.bearerTokenDescription")}
                  </FieldDescription>
                </Field>
              </FieldGroup>

              <Alert>
                <ShieldAlertIcon />
                <AlertTitle>{t("settings.security.title")}</AlertTitle>
                <AlertDescription>
                  {t("settings.security.description")}
                </AlertDescription>
              </Alert>
            </CardContent>
            <CardFooter className="flex flex-col gap-2 py-3 sm:flex-row sm:justify-end">
              <Button
                className="w-full sm:w-auto"
                disabled={
                  isTestingConnection || readDraftSettings().apiBaseUrl === ""
                }
                onClick={handleTestConnection}
                type="button"
                variant="outline"
              >
                {isTestingConnection
                  ? t("settings.connection.testingConnection")
                  : t("settings.connection.testConnection")}
              </Button>
              <Button className="w-full sm:w-auto" type="submit">
                {t("common.save")}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card className="gap-0 border-border/70 bg-card py-4">
          <CardHeader className="border-b">
            <CardTitle>{t("settings.preferences.title")}</CardTitle>
            <CardDescription>
              {t("settings.preferences.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 py-0">
            <SettingsPreferenceRow
              control={
                <LocaleToggle
                  className="min-w-20 justify-between self-start"
                  dropdownClassName="min-w-30"
                  size="default"
                />
              }
              description={t("settings.preferences.localeDescription")}
              label={t("settings.preferences.localeLabel")}
            />
            <Separator />
            <SettingsPreferenceRow
              control={
                <ThemeToggle
                  className="min-w-20 justify-between self-start"
                  size="default"
                />
              }
              description={t("settings.preferences.themeDescription")}
              label={t("settings.preferences.themeLabel")}
            />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function SettingsPreferenceRow({
  control,
  description,
  label,
}: {
  control: ReactNode;
  description: string;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-2.5 first:pt-2.5 last:pb-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="space-y-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="self-start">{control}</div>
    </div>
  );
}
