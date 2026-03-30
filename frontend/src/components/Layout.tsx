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
import { Button } from "@/components/ui/button";
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
              <LocaleToggle className="border-transparent shadow-none [&_svg]:size-6" />
              <ThemeToggle className="border-transparent shadow-none [&_svg]:size-6" />
              <Button
                asChild
                className="border-transparent shadow-none [&_svg]:size-6"
                size="icon-sm"
                type="button"
                variant="outline"
              >
                <a
                  aria-label="Open GitHub repository"
                  href="https://github.com/UnderHear/light-oss"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <svg
                    aria-hidden="true"
                    className="size-6"
                    height="24"
                    viewBox="0 0 24 24"
                    width="24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M12 .297c-6.63 0-12 5.373-12 12c0 5.303 3.438 9.8 8.205 11.385c.6.113.82-.258.82-.577c0-.285-.01-1.04-.015-2.04c-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729c1.205.084 1.838 1.236 1.838 1.236c1.07 1.835 2.809 1.305 3.495.998c.108-.776.417-1.305.76-1.605c-2.665-.3-5.466-1.332-5.466-5.93c0-1.31.465-2.38 1.235-3.22c-.135-.303-.54-1.523.105-3.176c0 0 1.005-.322 3.3 1.23c.96-.267 1.98-.399 3-.405c1.02.006 2.04.138 3 .405c2.28-1.552 3.285-1.23 3.285-1.23c.645 1.653.24 2.873.12 3.176c.765.84 1.23 1.91 1.23 3.22c0 4.61-2.805 5.625-5.475 5.92c.42.36.81 1.096.81 2.22c0 1.606-.015 2.896-.015 3.286c0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
                      fill="currentColor"
                    />
                  </svg>
                  <span className="sr-only">GitHub</span>
                </a>
              </Button>
            </div>
          </div>
        </header>

        <main className="flex flex-1 overflow-hidden">
          <div className="flex min-h-0 w-full flex-1 flex-col gap-6 overflow-auto px-4 py-4 md:px-6 md:py-6">
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
    key:
      | "breadcrumbs.dashboard"
      | "nav.dashboard"
      | "nav.buckets"
      | "nav.settings",
  ) => string,
) {
  const items: Array<{ label: string; href?: string }> = [];

  if (pathname === "/" || pathname.startsWith("/dashboard")) {
    items.push({ label: t("nav.dashboard") });
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
