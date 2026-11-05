import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Bell, CalendarDays, Contact, LayoutList, LockKeyhole, LogOut, Menu, Settings, SlidersHorizontal, Users, Wallet, type LucideIcon } from "lucide-react";
import { BranchSwitcher } from "@/components/BranchSwitcher";
import { GroomBoxLogo } from "@/components/GroomBoxLogo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { canReviewDeposits } from "@/features/deposits/deposit-access";
import { pendingDepositCountQueryOptions } from "@/features/deposits/deposit-queries";
import { useDepositUpdates } from "@/features/deposits/useDepositUpdates";
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
  link:
    | {
        to:
          | "/shop/$branchId/floor"
          | "/shop/$branchId/calendar"
          | "/shop/$branchId/setup"
          | "/shop/$branchId/deposits"
          | "/shop/$branchId/close";
        params: { branchId: string };
      }
    | { to: "/shop/team" | "/shop/notifications" | "/shop/setup" | "/shop/clients" };
  badge?: { count: number; label: string };
  // Phones show the main items in the bottom bar and the rest under More.
  inBottomBar: boolean;
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
  const reviewsDeposits = isActive && activeBranchId !== undefined && canReviewDeposits(currentMembership);
  useDepositUpdates(reviewsDeposits ? activeBranchId : undefined);
  const pendingDeposits =
    useQuery({ ...pendingDepositCountQueryOptions(activeBranchId ?? ""), enabled: reviewsDeposits }).data ?? 0;

  const items: NavigationItem[] = [];
  if (isActive && activeBranchId) {
    items.push({
      key: "floor",
      label: messages.shop.floor,
      icon: LayoutList,
      link: { to: "/shop/$branchId/floor", params: { branchId: activeBranchId } },
      inBottomBar: true,
    });
    items.push({
      key: "calendar",
      label: messages.shop.calendar,
      icon: CalendarDays,
      link: { to: "/shop/$branchId/calendar", params: { branchId: activeBranchId } },
      inBottomBar: true,
    });
  }
  if (reviewsDeposits && activeBranchId) {
    items.push({
      key: "deposits",
      label: messages.shop.deposits,
      icon: Wallet,
      link: { to: "/shop/$branchId/deposits", params: { branchId: activeBranchId } },
      badge: { count: pendingDeposits, label: messages.deposits.toReview },
      inBottomBar: true,
    });
  }
  if (isActive && currentMembership.role !== "staff") {
    items.push({ key: "clients", label: messages.shop.clients, icon: Contact, link: { to: "/shop/clients" }, inBottomBar: true });
  }
  if (isActive && activeBranchId && currentMembership.role !== "staff") {
    items.push({
      key: "daily-close",
      label: messages.shop.dailyClose,
      icon: LockKeyhole,
      link: { to: "/shop/$branchId/close", params: { branchId: activeBranchId } },
      inBottomBar: false,
    });
    items.push({
      key: "branch-setup",
      label: messages.shop.branchSetup,
      icon: SlidersHorizontal,
      link: { to: "/shop/$branchId/setup", params: { branchId: activeBranchId } },
      inBottomBar: false,
    });
  }
  if (isActive && currentMembership.role === "owner") {
    items.push({ key: "setup", label: messages.shop.setup, icon: Settings, link: { to: "/shop/setup" }, inBottomBar: false });
    items.push({ key: "team", label: messages.shop.team, icon: Users, link: { to: "/shop/team" }, inBottomBar: false });
  }
  items.push({
    key: "notifications",
    label: messages.shop.notifications,
    icon: Bell,
    link: { to: "/shop/notifications" },
    badge: { count: unreadCount, label: messages.notifications.unread },
    // Phones keep Floor, Calendar, Deposits, and Clients in the bottom bar (app flow §3).
    inBottomBar: false,
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
              <NavigationBadge badge={item.badge} />
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
          .filter((item) => item.inBottomBar)
          .map((item) => (
            <Link
              key={item.key}
              {...item.link}
              className="relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground data-[status=active]:text-primary"
            >
              <item.icon className="size-6" aria-hidden />
              {item.label}
              <NavigationBadge badge={item.badge} className="absolute top-1 right-1/4" />
            </Link>
          ))}
        <button
          type="button"
          className="relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground"
          onClick={() => setMoreOpen(true)}
        >
          <Menu className="size-6" aria-hidden />
          {messages.shop.more}
          <NavigationBadge
            badge={{
              count: items.filter((item) => !item.inBottomBar).reduce((sum, item) => sum + (item.badge?.count ?? 0), 0),
              label: messages.notifications.unread,
            }}
            className="absolute top-1 right-1/4"
          />
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
              .filter((item) => !item.inBottomBar)
              .map((item) => (
                <Link key={item.key} {...item.link} className={linkClassName} onClick={() => setMoreOpen(false)}>
                  <item.icon className="size-6" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  <NavigationBadge badge={item.badge} />
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

function NavigationBadge({ badge, className }: { badge: NavigationItem["badge"]; className?: string }) {
  if (!badge?.count) return null;
  return (
    <span
      className={cn(
        "min-w-5 rounded-full bg-primary px-1.5 text-center text-xs font-medium text-primary-foreground tabular-nums",
        className,
      )}
    >
      {badge.count > 99 ? "99+" : badge.count}
      <span className="sr-only"> {badge.label}</span>
    </span>
  );
}
