import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "./Layout";
import { renderWithApp } from "../test/test-utils";

describe("Layout", () => {
  it("renders the sidebar shell and breadcrumb header", async () => {
    renderWithApp(
      <Routes>
        <Route element={<Layout />}>
          <Route path="/console" element={<div>Console body</div>} />
        </Route>
      </Routes>,
      { route: "/console" },
    );

    expect(screen.getAllByText("Light OSS Console")).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Console" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "bucket" })).toBeInTheDocument();
    expect(screen.getAllByText("Console")[0]).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Toggle Sidebar" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Console body")).toBeInTheDocument();
  });
});
