"use client";

import type { JSX, ReactNode } from "react";
import { useEffect } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  const router = useRouter();

  useEffect(() => {
    navigation.forEach(({ href }) => {
      router.prefetch(href);
    });
  }, [router]);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-6">
        <header className="sticky top-4 z-30 rounded-[2rem] border border-border/90 bg-white/92 px-5 py-5 shadow-panel backdrop-blur">
          <div className="flex items-center justify-between gap-6">
            <Link className="flex shrink-0 items-center gap-3" href="/" prefetch>
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

            <nav className="hidden min-w-0 flex-1 items-center justify-center gap-2 xl:flex">
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
                    prefetch
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
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
                  prefetch
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
