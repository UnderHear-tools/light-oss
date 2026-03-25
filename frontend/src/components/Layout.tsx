import { NavLink, Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div className="shell">
      <header className="shell__header">
        <div>
          <p className="eyebrow">Lightweight Object Storage</p>
          <h1>Light OSS Console</h1>
        </div>
        <nav className="shell__nav">
          <NavLink to="/buckets">Buckets</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
      </header>
      <main className="shell__content">
        <Outlet />
      </main>
    </div>
  );
}
