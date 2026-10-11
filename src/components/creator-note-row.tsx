"use client";

import type { MouseEvent, ReactNode } from "react";
import { TableRow } from "@/components/ui/table";

export function CreatorNoteRow({ children }: { children: ReactNode }) {
  function openNote(event: MouseEvent<HTMLTableRowElement>) {
    const target = event.target;
    if (!(target instanceof Element) || !event.currentTarget.contains(target)) return;
    // Keep links, controls and dialogs using their own actions.
    if (target.closest('button,a,input,textarea,select,[role="button"],[role="menuitem"],[contenteditable="true"]')) return;
    event.currentTarget.querySelector<HTMLButtonElement>("[data-creator-note-trigger]")?.click();
  }
  return <TableRow onDoubleClick={openNote} title="双击此行编辑备注 / 待办">{children}</TableRow>;
}
