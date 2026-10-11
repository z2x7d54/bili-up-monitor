# Development notes

Read applicable Next.js documentation in node_modules/next/dist/docs before changing routing or component boundaries.

- This is a local application. Do not commit databases, Cookie values, environment files, logs, runtime binaries or user backups.
- Group trees allow four levels. Parent scopes include descendant accounts; reject cycles and invalid depth.
- Goals and reports are MONTH only. Dates use Asia/Shanghai. Statistics count videos published in the selected range with latest cumulative metrics.
- Keep the six most recent stored videos independent of the dashboard date filter.
- Missing collection coverage must remain pending, never inferred as zero posts or inactivity.
- Local display names and notes are separate from collected Bilibili profile names. Collection must preserve them.
- JSON migration validates before writing, remaps accounts by UID, deduplicates records and creates a credential-free backup. Preserve notes on legacy imports; explicit file-priority import may update them.
- Comparison export must match the selected creators or same-level groups and never silently export all.
- Use isolated databases for tests. Keep portable launcher paths relative and releases free of personal data.
