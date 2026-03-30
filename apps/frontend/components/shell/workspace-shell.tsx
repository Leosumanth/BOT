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
      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-5 px-4 py-4 lg:px-6">
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-72 shrink-0 overflow-hidden rounded-[2rem] border border-slate-900/80 bg-[linear-gradient(180deg,#0f172a_0%,#111827_55%,#172554_100%)] shadow-[0_28px_80px_rgba(15,23,42,0.28)] lg:flex lg:flex-col">
          <div className="border-b border-white/10 px-6 py-6">
            <Badge className="mb-4 w-fit rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-sky-200">
              Control Deck
            </Badge>
            <h1 className="font-sans text-3xl font-semibold tracking-tight text-white">MintBot Nexus</h1>
            <p className="mt-2 text-sm text-slate-400">
              Secure control for operations, wallets, endpoints, and API keys.
            </p>
          </div>

          <nav className="flex flex-1 flex-col gap-2 px-4 py-5">
            {navigation.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

              return (
                <Link
                  key={href}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                    active
                      ? "bg-white text-slate-950 shadow-[0_16px_35px_rgba(15,23,42,0.22)]"
                      : "text-slate-400 hover:bg-white/8 hover:text-white"
                  )}
                  href={href}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-white/10 px-6 py-5 text-sm text-slate-400">
            One secure workspace across tasks, RPC, wallets, and API workflows.
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="sticky top-4 z-30 rounded-[2rem] border border-slate-200/80 bg-white/88 px-4 py-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="flex flex-col gap-4 lg:hidden">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">MintBot</p>
                <h2 className="mt-1 font-sans text-2xl font-semibold text-slate-950">Secure Workspace</h2>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {navigation.map(({ href, label }) => {
                  const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
                  return (
                    <Link
                      key={href}
                      className={cn(
                        "whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition",
                        active
                          ? "border-slate-950 bg-slate-950 text-white"
                          : "border-slate-200 bg-white text-slate-600"
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
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Workspace</p>
                <h2 className="mt-1 font-sans text-2xl font-semibold text-slate-950">
                  {navigation.find((entry) => (entry.href === "/" ? pathname === "/" : pathname === entry.href || pathname.startsWith(`${entry.href}/`)))
                    ?.label ?? "Home"}
                </h2>
              </div>
              <Badge className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-emerald-700">
                Secure workspace
              </Badge>
            </div>
          </header>

          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
