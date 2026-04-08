import { FormEvent, useRef, useState } from "react";
import { ShieldAlertIcon, SlidersHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import { getHealthStatus } from "@/api/health";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
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
  const [apiBaseUrl, setApiBaseUrl] = useState(settings.apiBaseUrl);
  const [bearerToken, setBearerToken] = useState(settings.bearerToken);
  const [isBearerTokenVisible, setIsBearerTokenVisible] = useState(false);
  const [manualHealthStates, setManualHealthStates] =
    useState<ConnectionHealthStates | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const testRequestRef = useRef(0);

  const draftSettings = {
    apiBaseUrl: apiBaseUrl.trim(),
    bearerToken: bearerToken.trim(),
  };

  function clearManualHealthStates() {
    testRequestRef.current += 1;
    setManualHealthStates(null);
    setIsTestingConnection(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearManualHealthStates();
    saveSettings({
      apiBaseUrl: draftSettings.apiBaseUrl,
      bearerToken: draftSettings.bearerToken,
    });
    toast.success(t("toast.settingsSaved"));
  }

  async function handleTestConnection() {
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
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("settings.title")}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t("settings.description")}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <Card className="border-border/70 bg-card">
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>{t("settings.connection.title")}</CardTitle>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <ConnectionHealthStatus
                  states={manualHealthStates ?? undefined}
                />
                <Badge className="w-fit" variant="secondary">
                  {t("common.localStorage")}
                </Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("settings.connection.description")}
            </p>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="api-base-url">
                    {t("settings.connection.apiBaseUrl")}
                  </FieldLabel>
                  <Input
                    id="api-base-url"
                    onChange={(event) => {
                      setApiBaseUrl(event.target.value);
                      clearManualHealthStates();
                    }}
                    placeholder="http://localhost:8080"
                    value={apiBaseUrl}
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
                        onChange={(event) => {
                          setBearerToken(event.target.value);
                          clearManualHealthStates();
                        }}
                        placeholder="dev-token"
                        type={isBearerTokenVisible ? "text" : "password"}
                        value={bearerToken}
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
            </CardContent>
            <CardFooter className="flex flex-wrap justify-end gap-2">
              <Button
                disabled={draftSettings.apiBaseUrl === "" || isTestingConnection}
                onClick={handleTestConnection}
                type="button"
                variant="outline"
              >
                {isTestingConnection
                  ? t("settings.connection.testingConnection")
                  : t("settings.connection.testConnection")}
              </Button>
              <Button type="submit">{t("common.save")}</Button>
            </CardFooter>
          </form>
        </Card>

        <div className="grid gap-4 xl:sticky xl:top-20">
          <Card className="border-border/70 bg-card">
            <CardHeader>
              <CardTitle>{t("settings.preferences.title")}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("settings.preferences.description")}
              </p>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel>
                    {t("settings.preferences.localeLabel")}
                  </FieldLabel>
                  <LocaleToggle />
                  <FieldDescription>
                    {t("settings.preferences.localeDescription")}
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel>
                    {t("settings.preferences.themeLabel")}
                  </FieldLabel>
                  <ThemeToggle />
                  <FieldDescription>
                    {t("settings.preferences.themeDescription")}
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter className="justify-start">
              <Badge className="gap-1.5" variant="outline">
                <SlidersHorizontalIcon className="size-3.5" />
                {t("common.current")}
              </Badge>
            </CardFooter>
          </Card>

          <Alert>
            <ShieldAlertIcon />
            <AlertTitle>{t("settings.security.title")}</AlertTitle>
            <AlertDescription>
              {t("settings.security.description")}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </section>
  );
}
