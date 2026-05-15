import type { PropsWithChildren } from "react";

export function Badge({ children }: PropsWithChildren) {
  return (
    <span className="inline-flex h-6 items-center rounded border border-app-line px-2 font-mono text-xs text-app-muted">
      {children}
    </span>
  );
}
