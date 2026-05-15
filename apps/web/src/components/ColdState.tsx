import { Card } from "./Card";
import { Badge } from "./Badge";

export function ColdState({ message = "adapter not implemented" }: { message?: string }) {
  return (
    <Card>
      <div className="flex min-h-52 items-center justify-center">
        <div className="text-center">
          <Badge>cold</Badge>
          <p className="mt-3 text-sm text-app-muted">{message}</p>
        </div>
      </div>
    </Card>
  );
}
