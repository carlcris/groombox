import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Bell, LayoutList, LogOut, Menu, Users, type LucideIcon } from "lucide-react";
import { BranchSwitcher } from "@/components/BranchSwitcher";
import { GroomBoxLogo } from "@/components/GroomBoxLogo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { unreadNotificationCountQueryOptions } from "@/features/notifications/notification-queries";
import { useNotificationUpdates } from "@/features/notifications/useNotificationUpdates";
import { pickCurrentBranch } from "@/features/organization/current-workplace";
import type { Membership, WorkBranch } from "@/features/organization/membership-queries";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";
import { cn } from "@/lib/class-names";

type NavigationItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  link: { to: "/shop/$branchId/floor"; params: { branchId: string } } | { to: "/shop/team" | "/shop/notifications" };
  badge?: number;
};

const linkClassName = cn(
  "flex min-h-11 items-center gap-3 rounded-lg px-3 text-base font-medium text-muted-foreground transition-colors duration-150",
  "outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  "data-[status=active]:bg-accent data-[status=active]:text-accent-foreground",
);

export function ShopShell({
  userId,
  memberships,
  currentMembership,
  workBranches,
  children,
}: {
  userId: string;
  memberships: Membership[];
  currentMembership: Membership;
  workBranches: WorkBranch[];
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const { branchId } = useParams({ strict: false });
  const organizationBranches = workBranches.filter((branch) => branch.organizationId === currentMembership.organizationId);
  const activeBranchId = branchId ?? pickCurrentBranch(organizationBranches)?.id;
  const isActive = currentMembership.accessStatus === "active";

  useNotificationUpdates(userId);
  const unreadCount = useQuery(unreadNotificationCountQueryOptions(userId)).data ?? 0;

  const items: NavigationItem[] = [];
  if (isActive && activeBranchId) {
    items.push({
      key: "floor",
      label: messages.shop.floor,
      icon: LayoutList,
      link: { to: "/shop/$branchId/floor", params: { branchId: activeBranchId } },
    });
  }
  if (isActive && currentMembership.role === "owner") {
    items.push({ key: "team", label: messages.shop.team, icon: Users, link: { to: "/shop/team" } });
  }
  items.push({
    key: "notifications",
    label: messages.shop.notifications,
    icon: Bell,
    link: { to: "/shop/notifications" },
    badge: unreadCount,
  });

  async function signOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/sign-in" });
  }

  const switcher = (
    <BranchSwitcher
      memberships={memberships}
      currentMembership={currentMembership}
      workBranches={workBranches}
      activeBranchId={activeBranchId}
    />
  );

  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r bg-card p-4 md:flex">
        <GroomBoxLogo />
        {switcher}
        <nav aria-label={messages.shop.navigation} className="flex flex-1 flex-col gap-1">
          {items.map((item) => (
            <Link key={item.key} {...item.link} className={linkClassName}>
              <item.icon className="size-6" aria-hidden />
              <span className="flex-1">{item.label}</span>
              <NavigationBadge count={item.badge} />
            </Link>
          ))}
        </nav>
        <Button variant="ghost" className="justify-start" onClick={() => void signOut()}>
          <LogOut aria-hidden />
          {messages.auth.signOut}
        </Button>
      </aside>

      <main className="flex-1 px-4 pt-6 pb-28 md:px-6 md:pb-8 lg:px-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>

      <nav
        aria-label={messages.shop.navigation}
        className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card pb-[env(safe-area-inset-bottom)] shadow-lg md:hidden"
      >
        {items
          .filter((item) => item.key !== "team")
          .map((item) => (
            <Link
              key={item.key}
              {...item.link}
              className="relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground data-[status=active]:text-primary"
            >
              <item.icon className="size-6" aria-hidden />
              {item.label}
              <NavigationBadge count={item.badge} className="absolute top-1 right-1/4" />
            </Link>
          ))}
        <button
          type="button"
          className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground"
          onClick={() => setMoreOpen(true)}
        >
          <Menu className="size-6" aria-hidden />
          {messages.shop.more}
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-xl pb-6">
          <SheetHeader>
            <SheetTitle className="font-heading text-xl">{messages.shop.more}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4">
            {switcher}
            {items
              .filter((item) => item.key === "team")
              .map((item) => (
                <Link key={item.key} {...item.link} className={linkClassName} onClick={() => setMoreOpen(false)}>
                  <item.icon className="size-6" aria-hidden />
                  {item.label}
                </Link>
              ))}
            <Button variant="ghost" className="justify-start" onClick={() => void signOut()}>
              <LogOut aria-hidden />
              {messages.auth.signOut}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function NavigationBadge({ count, className }: { count: number | undefined; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "min-w-5 rounded-full bg-primary px-1.5 text-center text-xs font-medium text-primary-foreground tabular-nums",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
      <span className="sr-only"> {messages.notifications.unread}</span>
    </span>
  );
}
