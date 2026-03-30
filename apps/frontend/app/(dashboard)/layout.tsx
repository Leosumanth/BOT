import type { JSX, ReactNode } from "react";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
<<<<<<< HEAD
import { requireDashboardSession } from "@/lib/auth";
=======
import { requireDashboardSession } from "@/lib/dashboard-session";
>>>>>>> 67a447c10fc3fe55a5f452e92a7ac53ae87beaf0

export default async function DashboardLayout({ children }: { children: ReactNode }): Promise<JSX.Element> {
  await requireDashboardSession();

  return <WorkspaceShell>{children}</WorkspaceShell>;
}
