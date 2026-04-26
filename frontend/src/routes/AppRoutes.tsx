import KeepAlive from "react-activation";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { DashboardPage } from "../pages/DashboardPage";
import { BucketsPage } from "../pages/BucketsPage";
import { BucketObjectsPage } from "../pages/BucketObjectsPage";
import { SitesPage } from "../pages/SitesPage";
import { DocsPage } from "../pages/DocsPage";
import { SettingsPage } from "../pages/SettingsPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate replace to="/dashboard" />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/buckets" element={<BucketsPage />} />
        <Route path="/buckets/:bucket" element={<BucketObjectsKeepAlive />} />
        <Route path="/sites" element={<SitesPage />} />
      </Route>
    </Routes>
  );
}

function BucketObjectsKeepAlive() {
  const { bucket = "" } = useParams();
  const keepAliveClassName = "flex min-h-0 w-full flex-1 flex-col";

  return (
    <KeepAlive
      autoFreeze={false}
      cacheKey="bucket-objects"
      contentProps={{ className: keepAliveClassName }}
      id={bucket}
      name="bucket-objects"
      wrapperProps={{ className: keepAliveClassName }}
    >
      <BucketObjectsPage />
    </KeepAlive>
  );
}
