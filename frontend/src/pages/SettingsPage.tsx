import { FormEvent, useState } from "react";
import { ShieldAlertIcon, SlidersHorizontalIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LocaleToggle } from "@/components/LocaleToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/components/ToastProvider";
import { useI18n } from "@/lib/i18n";
import { useAppSettings } from "@/lib/settings";

export function SettingsPage() {
  const { settings, saveSettings } = useAppSettings();
  const { t } = useI18n();
  const { pushToast } = useToast();
  const [apiBaseUrl, setApiBaseUrl] = useState(settings.apiBaseUrl);
  const [bearerToken, setBearerToken] = useState(settings.bearerToken);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveSettings({
      apiBaseUrl: apiBaseUrl.trim(),
      bearerToken: bearerToken.trim(),
    });
    pushToast("success", t("toast.settingsSaved"));
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{t("settings.title")}</Badge>
          <Badge variant="secondary">{t("common.localStorage")}</Badge>
        </div>
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
            <CardTitle>{t("settings.connection.title")}</CardTitle>
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
                    onChange={(event) => setApiBaseUrl(event.target.value)}
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
                  <Input
                    id="bearer-token"
                    onChange={(event) => setBearerToken(event.target.value)}
                    placeholder="dev-token"
                    type="password"
                    value={bearerToken}
                  />
                  <FieldDescription>
                    {t("settings.connection.bearerTokenDescription")}
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter className="justify-end">
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
                  <FieldLabel>{t("settings.preferences.localeLabel")}</FieldLabel>
                  <LocaleToggle />
                  <FieldDescription>
                    {t("settings.preferences.localeDescription")}
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel>{t("settings.preferences.themeLabel")}</FieldLabel>
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
            <AlertDescription>{t("settings.security.description")}</AlertDescription>
          </Alert>
        </div>
      </div>
    </section>
  );
}
