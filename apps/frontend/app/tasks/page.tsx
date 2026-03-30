import type { JSX } from "react";
import type { TaskRecord, WalletRecord } from "@mintbot/shared";
import { TasksPage } from "@/components/pages/tasks-page";
import { backendFetch } from "@/lib/api";
import { emptyTasks } from "@/lib/defaults";

export default async function TasksRoute(): Promise<JSX.Element> {
  const [tasks, wallets] = await Promise.all([
    backendFetch<TaskRecord[]>("/tasks").catch(() => emptyTasks),
    backendFetch<WalletRecord[]>("/wallets").catch(() => [])
  ]);

  return <TasksPage tasks={tasks} wallets={wallets} />;
}
