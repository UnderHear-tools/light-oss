"use client"

import {
  ServerIcon,
  ShieldCheckIcon,
} from "lucide-react"
import { ConnectionHealthStatus } from "@/components/ConnectionHealthStatus"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useI18n } from "@/lib/i18n"

export function NavProjects({
  connection,
}: {
  connection: {
    host: string
    tokenConfigured: boolean
  }
}) {
  const { t } = useI18n()

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>{t("header.connection")}</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex w-full min-w-0 items-center gap-2 overflow-hidden px-2 py-1 text-sm text-sidebar-foreground [&>span:last-child]:truncate [&_svg]:size-4 [&_svg]:shrink-0">
            <ServerIcon />
            <span>{connection.host}</span>
          </div>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <div className="flex w-full min-w-0 items-center gap-2 overflow-hidden px-2 py-1 text-sm text-sidebar-foreground [&>span:last-child]:truncate [&_svg]:size-4 [&_svg]:shrink-0">
            <ShieldCheckIcon />
            <span>
              {connection.tokenConfigured
                ? t("header.authConfigured")
                : t("header.authMissing")}
            </span>
          </div>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <ConnectionHealthStatus className="px-2 py-1 grid gap-2" />
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}
