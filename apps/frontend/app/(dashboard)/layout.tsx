import type { JSX, ReactNode } from "react";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { requireDashboardSession } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: ReactNode }): Promise<JSX.Element> {
  await requireDashboardSession();

  return <WorkspaceShell>{children}</WorkspaceShell>;
}
