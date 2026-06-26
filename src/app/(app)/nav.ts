import {
  Users,
  RefreshCw,
  ShieldCheck,
  MessageCircle,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Match nested routes too (e.g. /candidates/[id]). Exact match if false. */
  matchNested?: boolean;
  /** Only render for admins (the page itself also guards server-side). */
  adminOnly?: boolean;
};

// Primary navigation. Add a page here and it shows up in the sidebar — that's
// the whole change. Keep `/` last-checked items above their nested children.
export const NAV_ITEMS: NavItem[] = [
  { title: "Candidates", href: "/", icon: Users, matchNested: false },
  { title: "Messages", href: "/messages", icon: MessageCircle, matchNested: true, adminOnly: true },
  { title: "Handbook", href: "/handbook", icon: BookOpen, matchNested: true, adminOnly: true },
  { title: "Sync", href: "/import", icon: RefreshCw, matchNested: true, adminOnly: true },
  { title: "Users", href: "/users", icon: ShieldCheck, matchNested: true, adminOnly: true },
];

/** True when `item` should be highlighted for the current pathname. */
export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") {
    // Home (candidates list) also owns the candidate detail/tier routes.
    return pathname === "/" || pathname.startsWith("/candidates");
  }
  return item.matchNested
    ? pathname === item.href || pathname.startsWith(`${item.href}/`)
    : pathname === item.href;
}
