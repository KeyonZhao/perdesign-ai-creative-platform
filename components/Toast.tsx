"use client";

import { CheckCircle2, Info, XCircle } from "lucide-react";
import type { ToastMessage } from "@/lib/types";

export function Toast({ toasts }: { toasts: ToastMessage[] }) {
  return (
    <div className="fixed right-4 top-4 z-50 flex w-[min(92vw,380px)] flex-col gap-3">
      {toasts.map((toast) => {
        const Icon = toast.type === "success" ? CheckCircle2 : toast.type === "error" ? XCircle : Info;
        return (
          <div key={toast.id} className="content-card flex items-start gap-3 rounded-[18px] px-4 py-3 text-sm text-slate-100">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-violet-200" />
            <span className="leading-6">{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}
