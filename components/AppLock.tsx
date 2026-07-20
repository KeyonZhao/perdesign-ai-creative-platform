"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { MoveRight } from "lucide-react";

export function AppLock({ children }: { children: React.ReactNode }) {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState("");
  const appPassword = process.env.NEXT_PUBLIC_APP_LOCK_PASSWORD || "8888";

  useEffect(() => {
    setUnlocked(localStorage.getItem("product-workstation-unlocked") === "true");
  }, []);

  function unlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (normalizePassword(password) === normalizePassword(appPassword)) {
      localStorage.setItem("product-workstation-unlocked", "true");
      setUnlocked(true);
      setError("");
      return;
    }
    setError("口令不正确。默认口令是 8888，如已配置环境变量请使用配置后的口令。");
  }

  if (unlocked) return <>{children}</>;

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <form onSubmit={unlock} className="panel relative w-full max-w-[460px] overflow-hidden rounded-xl p-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
        <div className="mb-7 flex items-center gap-4">
          <div className="brand-logo-frame h-16 w-16">
            <img src="/pinwu-logo.png" alt="品物AI设计工作站 Logo" className="brand-logo-img" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">PINWU AI</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal text-white">品物AI设计工作站</h1>
          </div>
        </div>
        <p className="text-sm leading-6 text-slate-400">输入访问口令，进入设计工作台</p>
        <input
          className="field mt-7 h-12 px-4"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
          placeholder="访问口令"
        />
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
        <button className="btn-primary mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg font-medium" type="submit">
          进入工作台
          <MoveRight className="h-4 w-4" />
        </button>
      </form>
    </main>
  );
}

function normalizePassword(value: string) {
  return value.trim().replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xff10 + 48));
}
