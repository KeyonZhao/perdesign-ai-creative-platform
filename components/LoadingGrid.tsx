"use client";

export function LoadingGrid({ count }: { count: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="liquid-card rounded-2xl p-3">
          <div className="skeleton aspect-square rounded-2xl" />
          <div className="mt-4 h-4 w-28 rounded-full skeleton" />
          <div className="mt-3 h-3 w-full rounded-full skeleton" />
          <div className="mt-2 h-3 w-2/3 rounded-full skeleton" />
        </div>
      ))}
    </div>
  );
}
