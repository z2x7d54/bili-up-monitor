"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type GroupComboboxInputProps = {
  id: string;
  name: string;
  groups: Array<string | { name: string; path?: string }>;
  defaultValue?: string;
  placeholder?: string;
};

export function GroupComboboxInput({
  id,
  name,
  groups,
  defaultValue = "",
  placeholder = "未分组",
}: GroupComboboxInputProps) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const options = useMemo(() => {
    return Array.from(new Set(["未分组", ...groups.map(g => typeof g === "string" ? g : g.name)].filter(Boolean)));
  }, [groups]);
  const labels = new Map(groups.filter(g => typeof g !== "string").map(g => typeof g === "string" ? [g,g] : [g.name,g.path ?? g.name]));
  const keyword = value.trim().toLowerCase();
  const hasExactMatch = options.some((option) => option === value);
  const filteredOptions = keyword && !hasExactMatch
    ? options.filter((option) => option.toLowerCase().includes(keyword))
    : options;
  const visibleOptions = filteredOptions.length > 0 ? filteredOptions : options;

  return (
    <div
      className="relative"
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <Input
        id={id}
        name={name}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
        }}
        placeholder={placeholder}
        autoComplete="off"
        className="pr-9"
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-slate-500 hover:bg-muted/70 hover:text-slate-900"
        aria-label="选择已有分组"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && visibleOptions.length > 0 ? (
        <div className="absolute z-50 mt-1 max-h-44 w-full overflow-y-auto rounded-md border border-black/[0.055] bg-white p-1 shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
          {visibleOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={cn(
                "flex h-8 w-full cursor-pointer items-center rounded px-2 text-left text-sm hover:bg-muted/70",
                option === value && "bg-muted/70 font-medium",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setValue(option);
                setOpen(false);
              }}
            >
              {labels.get(option) ?? option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
