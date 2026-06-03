"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { NAV_ITEMS, isActive } from "./nav";

export function AppSidebar({
  user,
}: {
  user: { name?: string | null; email: string; role?: string | null };
}) {
  const pathname = usePathname();
  const displayName = user.name || user.email;
  const navItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || user.role === "admin",
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/"
          className="flex items-center gap-2 px-1 py-1.5"
          aria-label="ISEF Admin home"
        >
          {/* Compact mark when the sidebar is collapsed to icons */}
          <span className="hidden size-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#7C3AED] to-[#2F46E6] font-bold text-white group-data-[collapsible=icon]:flex">
            I
          </span>
          <Image
            src="/isef-logo.png"
            alt="ISEF"
            width={614}
            height={192}
            priority
            className="h-6 w-auto group-data-[collapsible=icon]:hidden"
          />
          <span className="text-sm font-medium text-muted-foreground group-data-[collapsible=icon]:hidden">
            Admin
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item, pathname)}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon />
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
        <div className="flex flex-col gap-2 group-data-[collapsible=icon]:hidden">
          <span className="truncate px-1 text-xs text-muted-foreground">
            {displayName}
          </span>
          <ThemeToggle />
          <SignOutButton />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
