import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Settings as SettingsIcon, ShoppingCart, Receipt, LogOut, Cog, Users, Search, Wallet } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";

export function AppSidebar() {
  const { role, user, signOut } = useAuth();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const isActive = (p: string) => path === p;

  const userItems = [
    { title: "Dashboard", url: "/app/dashboard", icon: LayoutDashboard },
    { title: "Residential Proxy", url: "/app/proxy", icon: ShoppingCart },
    { title: "Billing", url: "/app/billing", icon: Receipt },
    { title: "Settings", url: "/app/settings", icon: SettingsIcon },
  ];

  const adminItems = [
    { title: "Dashboard", url: "/app/admin", icon: LayoutDashboard },
    { title: "Config", url: "/app/admin/config", icon: Cog },
    { title: "Payment", url: "/app/admin/payment", icon: Wallet },
    { title: "Orders", url: "/app/admin/orders", icon: Receipt },
    { title: "User Management", url: "/app/admin/users", icon: Users },
    { title: "SEO", url: "/app/admin/seo", icon: Search },
  ];

  const items = role === "admin" ? adminItems : userItems;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="px-3 py-2">
          <h1 className="text-lg font-bold">ResidentProxy.com</h1>
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{role === "admin" ? "Admin" : "Account"}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={async () => {
                await signOut();
                navigate({ to: "/" });
              }}
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
