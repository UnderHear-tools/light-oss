import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "../components/Layout";
import { DashboardPage } from "../pages/DashboardPage";
import { BucketsPage } from "../pages/BucketsPage";
import { BucketObjectsPage } from "../pages/BucketObjectsPage";
import { SettingsPage } from "../pages/SettingsPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate replace to="/dashboard" />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/buckets" element={<BucketsPage />} />
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Route>
    </Routes>
  );
}
