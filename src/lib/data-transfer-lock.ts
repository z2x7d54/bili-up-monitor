const runtime = globalThis as unknown as { yourBiliDataTransfer?: { importing: boolean; writers: number } };
const state = runtime.yourBiliDataTransfer ?? { importing: false, writers: 0 };
runtime.yourBiliDataTransfer = state;
export async function withDataWrite<T>(work: () => Promise<T>): Promise<T> {
  if (state.importing) throw new Error("正在导入数据，请完成后再执行采集或查看通知。");
  state.writers++;
  try { return await work(); } finally { state.writers--; }
}
export async function withDataImport<T>(work: () => Promise<T>): Promise<T> {
  if (state.importing) throw new Error("已有数据导入正在进行，请等待完成。");
  if (state.writers) throw new Error("当前正在采集或生成周报，请完成后再上传数据。");
  state.importing = true;
  try { return await work(); } finally { state.importing = false; }
}
