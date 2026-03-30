"use client";

import type { JSX, ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Home" },
  { href: "/tasks", label: "Tasks" },
  { href: "/rpc", label: "RPC" },
  { href: "/wallets", label: "Wallets" },
  { href: "/api", label: "API" }
] satisfies Array<{ href: Route; label: string }>;

export function WorkspaceShell({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-6">
        <div className="rounded-[2rem] bg-[linear-gradient(90deg,#3648b9_0%,#3b55d6_58%,#465ef2_100%)] px-6 py-3 text-white shadow-[0_18px_44px_rgba(54,72,185,0.22)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm font-medium text-white/90">Shape what's next for tasks, wallets, RPC routes, and secure API controls.</p>
            <button className="w-fit rounded-full bg-white px-6 py-2 text-sm font-semibold text-[#3648b9]" type="button">
              Secure workspace
            </button>
          </div>
        </div>

        <header className="sticky top-4 z-30 mt-5 rounded-[2rem] border border-border/90 bg-white/92 px-5 py-5 shadow-panel backdrop-blur">
          <div className="flex items-center justify-between gap-6">
            <Link className="flex shrink-0 items-center gap-3" href="/">
              <div className="grid h-11 w-11 grid-cols-2 gap-1 rounded-2xl bg-[linear-gradient(135deg,#4debd2,#3648b9)] p-2 shadow-[0_12px_24px_rgba(54,72,185,0.18)]">
                <span className="rounded-md bg-white/95" />
                <span className="rounded-md bg-white/75" />
                <span className="rounded-md bg-white/75" />
                <span className="rounded-md bg-white/95" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">MintBot</p>
                <p className="text-2xl font-semibold tracking-tight text-foreground">Nexus</p>
              </div>
            </Link>

            <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 xl:flex">
              {navigation.map(({ href, label }) => {
                const active = href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

                return (
                  <Link
                    key={href}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-medium transition",
                      active ? "bg-accent text-accent-foreground" : "text-foreground/78 hover:bg-muted hover:text-foreground"
                    )}
                    href={href}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>

            <div className="hidden shrink-0 items-center gap-3 lg:flex">
              <span className="text-sm font-medium text-foreground/80">Log In</span>
              <button
                className="rounded-full border border-primary/35 px-7 py-3 text-sm font-semibold text-primary transition hover:bg-primary hover:text-primary-foreground"
                type="button"
              >
                Get Started
              </button>
            </div>
          </div>

          <div className="mt-5 flex gap-2 overflow-x-auto pb-1 xl:hidden">
            {navigation.map(({ href, label }) => {
              const active = href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

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
        </header>

        <main className="mt-5 min-w-0">{children}</main>
      </div>
    </div>
  );
}
