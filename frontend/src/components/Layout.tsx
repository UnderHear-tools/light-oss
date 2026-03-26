import { Fragment } from "react";
import { Outlet, NavLink, useLocation, useParams } from "react-router-dom";
import { AppSidebar } from "@/components/app-sidebar";
import { LocaleToggle } from "@/components/LocaleToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useI18n } from "@/lib/i18n";

export function Layout() {
  const { pathname } = useLocation();
  const { bucket } = useParams();
  const { t } = useI18n();
  const breadcrumbItems = buildBreadcrumbs(pathname, bucket, t);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-h-svh overflow-hidden bg-transparent">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b border-border/70 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-14">
          <div className="flex w-full items-center gap-2 px-4 md:px-6">
            <SidebarTrigger className="-ml-1 cursor-pointer" />
            <Separator
              orientation="vertical"
              className="mr-1 hidden data-vertical:h-4 data-vertical:self-auto sm:block"
            />

            <Breadcrumb className="min-w-0 flex-1">
              <BreadcrumbList>
                {breadcrumbItems.map((item, index) => {
                  const isLast = index === breadcrumbItems.length - 1;
                  return (
                    <Fragment key={`${item.label}-${index}`}>
                      <BreadcrumbItem>
                        {item.href && !isLast ? (
                          <BreadcrumbLink asChild>
                            <NavLink to={item.href}>{item.label}</NavLink>
                          </BreadcrumbLink>
                        ) : (
                          <BreadcrumbPage className="truncate">
                            {item.label}
                          </BreadcrumbPage>
                        )}
                      </BreadcrumbItem>
                      {!isLast ? (
                        <BreadcrumbSeparator className="hidden md:block" />
                      ) : null}
                    </Fragment>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>

            <div className="hidden items-center gap-2 lg:flex">
              <LocaleToggle className="w-auto" />
              <ThemeToggle className="w-auto" />
            </div>
          </div>
        </header>

        <main className="flex flex-1 overflow-hidden">
          <div className="flex min-h-0 w-full flex-1 flex-col gap-6 overflow-auto px-2 py-2 md:px-3 md:py-3">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function buildBreadcrumbs(
  pathname: string,
  bucket: string | undefined,
  t: (
    key: "breadcrumbs.console" | "nav.console" | "nav.buckets" | "nav.settings",
  ) => string,
) {
  const items: Array<{ label: string; href?: string }> = [];

  if (pathname === "/" || pathname.startsWith("/console")) {
    items.push({ label: t("nav.console") });
    return items;
  }

  if (pathname.startsWith("/settings")) {
    items.push({ label: t("nav.settings") });
    return items;
  }

  items.push({ label: t("nav.buckets"), href: "/buckets" });

  if (bucket) {
    items.push({ label: bucket });
  }

  return items;
}
