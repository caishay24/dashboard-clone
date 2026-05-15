import type { PropsWithChildren, ReactNode } from "react";

export function Card({ title, children }: PropsWithChildren<{ title?: ReactNode }>) {
  return (
    <section className="rounded-lg border border-app-line bg-app-panel p-4">
      {title ? <h2 className="mb-3 text-sm font-bold text-app-fg">{title}</h2> : null}
      {children}
    </section>
  );
}
