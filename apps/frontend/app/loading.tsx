import type { JSX } from "react";

export default function Loading(): JSX.Element {
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-panel">
        <div className="h-48 animate-pulse bg-[linear-gradient(135deg,#f8fbff,#eef2ff)]" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <div className="space-y-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-panel">
              <div className="h-24 animate-pulse border-b border-blue-100 bg-[linear-gradient(135deg,#f8fbff,#ffffff)]" />
              <div className="grid gap-3 p-4 md:grid-cols-2">
                {Array.from({ length: 4 }).map((__, cardIndex) => (
                  <div key={cardIndex} className="h-32 animate-pulse rounded-[1.5rem] bg-muted/70" />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-[2rem] border border-blue-100 bg-white p-6 shadow-panel">
          <div className="h-[520px] animate-pulse rounded-[1.5rem] bg-[linear-gradient(135deg,#f8fbff,#ffffff)]" />
        </div>
      </div>
    </div>
  );
}
