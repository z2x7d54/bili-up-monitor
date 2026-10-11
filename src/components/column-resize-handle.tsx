"use client";

import { useEffect } from "react";

type ColumnResizeHandleProps = {
  cssVar: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function ColumnResizeHandle({
  cssVar,
  defaultWidth,
  minWidth,
  maxWidth,
}: ColumnResizeHandleProps) {
  useEffect(() => {
    document.documentElement.style.setProperty(cssVar, `${clamp(defaultWidth, minWidth, maxWidth)}px`);
  }, [cssVar, defaultWidth, maxWidth, minWidth]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const current = window.getComputedStyle(document.documentElement).getPropertyValue(cssVar);
    const startWidth = Number.parseInt(current, 10) || defaultWidth;

    function onPointerMove(moveEvent: PointerEvent) {
      const nextWidth = clamp(startWidth + moveEvent.clientX - startX, minWidth, maxWidth);
      document.documentElement.style.setProperty(cssVar, `${nextWidth}px`);
    }

    function onPointerUp() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }

  return (
    <div
      aria-hidden="true"
      className="absolute right-0 top-0 z-30 flex h-full w-2 cursor-col-resize touch-none items-center justify-center"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={onPointerDown}
    >
      <span className="h-5 w-px rounded bg-slate-300 opacity-0 transition-opacity hover:opacity-100" />
    </div>
  );
}
