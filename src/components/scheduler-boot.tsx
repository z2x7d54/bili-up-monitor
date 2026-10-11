"use client";

import { useEffect } from "react";

export function SchedulerBoot() {
  useEffect(() => {
    fetch("/api/scheduler/ping").catch(() => {
      // The dashboard can still be used when the local scheduler boot ping fails.
    });
  }, []);

  return null;
}
