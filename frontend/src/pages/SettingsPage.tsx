import { FormEvent, useState } from "react";
import { useToast } from "../components/ToastProvider";
import { useAppSettings } from "../lib/settings";

export function SettingsPage() {
  const { settings, saveSettings } = useAppSettings();
  const { pushToast } = useToast();
  const [apiBaseUrl, setApiBaseUrl] = useState(settings.apiBaseUrl);
  const [bearerToken, setBearerToken] = useState(settings.bearerToken);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveSettings({
      apiBaseUrl: apiBaseUrl.trim(),
      bearerToken: bearerToken.trim(),
    });
    pushToast("success", "连接设置已保存");
  }

  return (
    <section className="page-grid">
      <div className="panel">
        <div className="panel__header">
          <h2>Connection Settings</h2>
          <span>Stored in localStorage</span>
        </div>
        <form className="form-grid" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="api-base-url">API Base URL</label>
            <input
              id="api-base-url"
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrl(event.target.value)}
              placeholder="http://localhost:8080"
            />
          </div>
          <div>
            <label htmlFor="bearer-token">Bearer Token</label>
            <input
              id="bearer-token"
              type="password"
              value={bearerToken}
              onChange={(event) => setBearerToken(event.target.value)}
              placeholder="dev-token"
            />
          </div>
          <button className="button" type="submit">
            Save Settings
          </button>
        </form>
      </div>
      <div className="panel panel--note">
        <h2>Security Notice</h2>
        <p>
          This MVP stores the token in localStorage and is only suitable for
          local demo use.
        </p>
        <p>
          Production deployments should move credentials to a safer storage
          model and tighten CORS.
        </p>
      </div>
    </section>
  );
}
