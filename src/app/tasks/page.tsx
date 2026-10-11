import { creatorDisplayName } from "@/lib/creator-personal";
import { Badge } from "@/components/ui/badge";
import { TableEmptyState } from "@/components/table-empty-state";
import { TablePagination } from "@/components/table-pagination";
import {
  TaskRunDetailsDialog,
  type TaskRunDetailItem,
} from "@/components/task-run-details-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TaskActions } from "@/components/task-actions";
import { TaskCreateForm } from "@/components/task-create-form";
import { ensureSettings, prisma } from "@/lib/db";
import { listCreatorGroups } from "@/lib/groups";
import { clampPage, pageOffset, parsePage, parsePageSize } from "@/lib/pagination";
import { formatDateTime, statusLabel, targetModeLabel } from "@/lib/view-format";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

function statusClass(status: string, isRunning: boolean) {
  if (isRunning) return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "ACTIVE") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "ERROR") return "bg-rose-50 text-rose-700 border-rose-200";
  return "border-slate-100 bg-slate-100 text-slate-600";
}

function runStatusClass(status: string) {
  if (status === "RUNNING") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "SUCCESS") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "PARTIAL") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "FAILED") return "bg-rose-50 text-rose-700 border-rose-200";
  return "border-slate-100 bg-slate-100 text-slate-600";
}

function formatDuration(startedAt: Date, finishedAt: Date | null) {
  const end = finishedAt ?? new Date();
  const seconds = Math.max(0, Math.round((end.getTime() - startedAt.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  if (minutes < 60) return restSeconds ? `${minutes}m ${restSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`;
}

function parseRunDetails(details: string | null): TaskRunDetailItem[] {
  if (!details) return [];

  try {
    const parsed = JSON.parse(details) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as { name?: unknown; mid?: unknown; status?: unknown; message?: unknown };
        return {
          name: typeof record.name === "string" ? record.name : typeof record.mid === "string" ? record.mid : "未知 UP",
          mid: typeof record.mid === "string" ? record.mid : null,
          status: typeof record.status === "string" ? record.status : "unknown",
          message: typeof record.message === "string" ? record.message : null,
        };
      })
      .filter((item): item is TaskRunDetailItem => Boolean(item));
  } catch {
    return [];
  }
}

function summarizeDetails(details: string | null) {
  if (!details) return null;

  const items = parseRunDetails(details);
  if (items.length) {
    const failed = items.filter((item) => item.status === "failed");
    if (failed.length) {
      return failed
        .slice(0, 3)
        .map((item) => `${item.name}${item.message ? `：${item.message}` : ""}`)
        .join("；");
    }

    const success = items.filter((item) => item.status === "success");
    if (success.length) {
      const names = success
        .slice(0, 3)
        .map((item) => item.name)
        .join("、");
      return `成功：${names}${success.length > 3 ? ` 等 ${success.length} 个` : ""}`;
    }

    return `本次执行对象 ${items.length} 个`;
  }

  return details;
}

export default async function TasksPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const requestedTaskPage = parsePage(params.taskPage?.trim());
  const taskPageSize = parsePageSize(params.taskPageSize?.trim());
  const requestedRunPage = parsePage(params.runPage?.trim());
  const runPageSize = parsePageSize(params.runPageSize?.trim());

  const [taskTotal, runTotal, creators, groups, settings] = await Promise.all([
    prisma.monitorTask.count(),
    prisma.taskRunLog.count(),
    prisma.upCreator.findMany({
      where: { status: "MONITORING" },
      select: { id: true, name: true, alias: true, mid: true, groupName: true },
      orderBy: { updatedAt: "desc" },
    }),
    listCreatorGroups(),
    ensureSettings(),
  ]);
  const taskPage = clampPage(requestedTaskPage, taskTotal, taskPageSize);
  const runPage = clampPage(requestedRunPage, runTotal, runPageSize);
  const [tasks, runLogs] = await Promise.all([
    prisma.monitorTask.findMany({
      include: {
        targets: { include: { creator: true } },
        runs: { orderBy: { startedAt: "desc" }, take: 2 },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      skip: pageOffset(taskPage, taskPageSize),
      take: taskPageSize,
    }),
    prisma.taskRunLog.findMany({
      include: { task: { include: { targets: true } } },
      orderBy: { startedAt: "desc" },
      skip: pageOffset(runPage, runPageSize),
      take: runPageSize,
    }),
  ]);

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-black/[0.055] bg-white p-6 shadow-none">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">监控任务</h1>
            <p className="mt-1 text-sm text-slate-500">创建任务、启停轮询、立即执行抓取</p>
          </div>
          <TaskCreateForm
            creators={creators.map(c=>({...c,name:creatorDisplayName(c)}))}
            groups={groups.map((item) => item.name)}
            defaultInterval={settings.defaultIntervalMinutes}
          />
        </div>
      </section>

      <section className="rounded-lg border border-black/[0.055] bg-white shadow-none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>任务</TableHead>
              <TableHead>范围</TableHead>
              <TableHead>间隔</TableHead>
              <TableHead>下次执行</TableHead>
              <TableHead>最近结果</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.length === 0 ? (
              <TableRow>
                <TableEmptyState colSpan={7}>
                  暂无监控任务。创建任务后可以手动执行或等待本地调度器轮询。
                </TableEmptyState>
              </TableRow>
            ) : (
              tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>
                    <div className="font-medium">{task.name}</div>
                    <div className="text-xs text-slate-500">最近运行：{formatDateTime(task.lastRunAt)}</div>
                  </TableCell>
                  <TableCell>{targetModeLabel(task.targetMode, task.groupName, task.targets.length)}</TableCell>
                  <TableCell>{task.intervalMinutes} 分钟</TableCell>
                  <TableCell>{formatDateTime(task.nextRunAt)}</TableCell>
                  <TableCell>
                    <div className="max-w-64 truncate text-sm">{task.lastResult || "-"}</div>
                    {task.lastError ? <div className="max-w-64 truncate text-xs text-rose-600">{task.lastError}</div> : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusClass(task.status, task.isRunning)}>
                      {task.isRunning ? "执行中" : statusLabel(task.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <TaskActions id={task.id} status={task.status} isRunning={task.isRunning} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          total={taskTotal}
          page={taskPage}
          pageSize={taskPageSize}
          pageParam="taskPage"
          pageSizeParam="taskPageSize"
        />
      </section>

      <section className="rounded-lg border border-black/[0.055] bg-white shadow-none">
        <div className="flex items-center justify-between border-b border-black/[0.045] px-5 py-4">
          <div>
            <h2 className="font-semibold">执行记录</h2>
            <p className="text-sm text-slate-500">按开始时间倒序查看任务运行结果和失败原因。</p>
          </div>
        </div>
        <Table className="min-w-[1080px]">
          <TableHeader>
            <TableRow>
              <TableHead>任务</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>开始时间</TableHead>
              <TableHead>结束时间</TableHead>
              <TableHead>耗时</TableHead>
              <TableHead>成功/失败</TableHead>
              <TableHead>内容数</TableHead>
              <TableHead>日志信息</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runLogs.length === 0 ? (
              <TableRow>
                <TableEmptyState colSpan={8}>
                  暂无执行记录。手动执行任务或等待调度器轮询后会写入记录。
                </TableEmptyState>
              </TableRow>
            ) : (
              runLogs.map((run) => {
                const details = parseRunDetails(run.details);
                const detailSummary = summarizeDetails(run.details);
                const runTaskName = run.task?.name || "已删除任务";
                const runTargetLabel = run.task
                  ? targetModeLabel(run.task.targetMode, run.task.groupName, run.task.targets.length)
                  : "任务已删除，无法读取当前范围";
                const runStatusLabelText = statusLabel(run.status);

                return (
                  <TableRow key={run.id}>
                    <TableCell>
                      <div className="font-medium">{runTaskName}</div>
                      <div className="mt-1 text-xs text-slate-500">{runTargetLabel}</div>
                      {run.errorCode ? (
                        <div className="mt-1 text-xs text-slate-500">错误码：{run.errorCode}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={runStatusClass(run.status)}>
                        {runStatusLabelText}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(run.startedAt)}</TableCell>
                    <TableCell>{formatDateTime(run.finishedAt)}</TableCell>
                    <TableCell>{formatDuration(run.startedAt, run.finishedAt)}</TableCell>
                    <TableCell>
                      <span className="text-emerald-700">{run.successCount}</span>
                      <span className="mx-1 text-slate-300">/</span>
                      <span className={run.failureCount > 0 ? "text-rose-600" : "text-slate-600"}>
                        {run.failureCount}
                      </span>
                    </TableCell>
                    <TableCell>{run.itemCount}</TableCell>
                    <TableCell>
                      <div className="flex max-w-[420px] items-center gap-2">
                        <div className="min-w-0 flex-1">
                          {run.errorMessage ? (
                            <div className="truncate text-sm text-rose-600" title={run.errorMessage}>
                              {run.errorMessage}
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                          {detailSummary ? (
                            <div className="truncate text-xs text-slate-500" title={detailSummary}>
                              {detailSummary}
                            </div>
                          ) : null}
                        </div>
                        <TaskRunDetailsDialog
                          taskName={runTaskName}
                          targetLabel={runTargetLabel}
                          statusLabel={runStatusLabelText}
                          successCount={run.successCount}
                          failureCount={run.failureCount}
                          itemCount={run.itemCount}
                          errorCode={run.errorCode}
                          errorMessage={run.errorMessage}
                          details={details}
                          rawDetails={run.details}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <TablePagination
          total={runTotal}
          page={runPage}
          pageSize={runPageSize}
          pageParam="runPage"
          pageSizeParam="runPageSize"
        />
      </section>
    </div>
  );
}
