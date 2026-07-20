"use client";

import type { ModelOption } from "@/lib/types";

type ModelSelectProps = {
  label: string;
  value: string;
  options: ModelOption[];
  onChange: (value: string) => void;
};

export function ModelSelect({ label, value, options, onChange }: ModelSelectProps) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-zinc-200">{label}</span>
      <select className="field h-11 px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[#161619]">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
