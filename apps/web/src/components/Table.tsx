import type { ReactNode } from "react";

export function Table({ headers, children }: { headers: string[]; children?: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="text-xs uppercase text-app-muted">
          <tr>{headers.map((header) => <th key={header} className="border-b border-app-line py-2 pr-4">{header}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
