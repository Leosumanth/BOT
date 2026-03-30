"use client";

import type { FormEvent, JSX } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginPage(): JSX.Element {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    startTransition(async () => {
      try {
        const response = await fetch("/api/session/login", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({ password })
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? "Unable to sign in.");
        }

        router.replace("/");
        router.refresh();
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to sign in.");
      }
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Dashboard Sign-In</CardTitle>
          <CardDescription>Enter the dashboard access password to unlock the MintBot control plane.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="space-y-2 text-sm font-medium text-foreground">
              Access password
              <Input
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <p className="min-h-5 text-sm text-muted-foreground">{feedback ?? "Sessions stay server-side and the backend admin token never reaches the browser."}</p>
            <Button className="w-full" disabled={isPending || !password.trim()} type="submit">
              {isPending ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
