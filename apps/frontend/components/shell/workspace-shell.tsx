"use client";

import type { JSX, ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ListChecks, RadioTower, ServerCog, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Home", icon: Home },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/rpc", label: "RPC", icon: RadioTower },
  { href: "/wallets", label: "Wallets", icon: WalletCards },
  { href: "/api", label: "API", icon: ServerCog }
] satisfies Array<{ href: Route; label: string; icon: typeof Home }>;

export function WorkspaceShell({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-6">
        <div className="rounded-[2rem] bg-[linear-gradient(90deg,#3648b9_0%,#3b55d6_58%,#465ef2_100%)] px-6 py-3 text-white shadow-[0_18px_44px_rgba(54,72,185,0.22)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm font-medium text-white/90">Shape what's next for tasks, wallets, RPC routes, and secure API controls.</p>
            <Badge className="w-fit rounded-full border border-white/30 bg-white px-4 py-1.5 text-[#3648b9]">Secure workspace</Badge>
          </div>
        </div>

        <div className="mt-5 flex min-h-[calc(100vh-7rem)] gap-5">
          <aside className="sticky top-4 hidden h-[calc(100vh-8.25rem)] w-72 shrink-0 overflow-hidden rounded-[2rem] border border-border bg-white/92 shadow-panel lg:flex lg:flex-col">
            <div className="border-b border-border/80 px-6 py-6">
              <Badge className="mb-4 w-fit rounded-full bg-secondary px-3 py-1 text-secondary-foreground" variant="success">
                Control Deck
              </Badge>
              <h1 className="font-sans text-3xl font-semibold tracking-tight text-foreground">MintBot Nexus</h1>
              <p className="mt-2 text-sm text-muted-foreground">A cleaner workspace for mint operations, routing, and protected keys.</p>
            </div>

            <nav className="flex flex-1 flex-col gap-2 px-4 py-5">
              {navigation.map(({ href, label, icon: Icon }) => {
                const active = href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

                return (
                  <Link
                    key={href}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition",
                      active
                        ? "border-blue-200 bg-[linear-gradient(135deg,#eef2ff,#f8fbff)] text-primary shadow-[0_14px_30px_rgba(70,82,220,0.12)]"
                        : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/70 hover:text-foreground"
                    )}
                    href={href}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-border/80 px-6 py-5 text-sm text-muted-foreground">
              One operational surface across tasks, RPC, wallets, and API workflows.
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <header className="sticky top-4 z-30 rounded-[2rem] border border-border/90 bg-white/90 px-4 py-4 shadow-panel backdrop-blur">
              <div className="flex flex-col gap-4 lg:hidden">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">MintBot</p>
                  <h2 className="mt-1 font-sans text-2xl font-semibold text-foreground">Operational Workspace</h2>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {navigation.map(({ href, label }) => {
                    const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
                    return (
                      <Link
                        key={href}
                        className={cn(
                          "whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition",
                          active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-white text-muted-foreground"
                        )}
                        href={href}
                      >
                        {label}
                      </Link>
                    );
                  })}
                </div>
              </div>

              <div className="hidden items-center justify-between gap-4 lg:flex">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Workspace</p>
                  <h2 className="mt-1 font-sans text-2xl font-semibold text-foreground">
                    {navigation.find((entry) => (entry.href === "/" ? pathname === "/" : pathname === entry.href || pathname.startsWith(`${entry.href}/`)))
                      ?.label ?? "Home"}
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className="rounded-full bg-accent px-4 py-1.5 text-accent-foreground">Premium control</Badge>
                  <div className="rounded-full border border-primary/20 px-5 py-2 text-sm font-semibold text-primary">Get Started</div>
                </div>
              </div>
            </header>

            <div className="min-w-0">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
