import { NavLink } from "react-router-dom"
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Settings2Icon } from "lucide-react"
import { useAppPreferences } from "@/lib/preferences"
import { useI18n } from "@/lib/i18n"

export function NavUser() {
  const { t } = useI18n()
  const {
    preferences: { locale, theme },
  } = useAppPreferences()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          tooltip={t("nav.settings")}
        >
          <NavLink to="/settings">
            <Avatar>
              <AvatarFallback>LO</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{t("nav.settings")}</span>
              <span className="truncate text-xs">{locale} · {theme}</span>
            </div>
            <Settings2Icon className="ml-auto size-4" />
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
