import { Navigate, Route, Routes } from "react-router-dom";
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
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
        <Route path="/sites" element={<SitesPage />} />
      </Route>
    </Routes>
  );
}
