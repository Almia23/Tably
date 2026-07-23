import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * A small colored chip for a participant's name — the color is stable per
 * person (driven by `colorClassOf` from table-context) and reused everywhere
 * a name shows up: item claims, the Participants list, settlement rows, and
 * the activity feed, so the same person is recognizable at a glance across
 * the whole app.
 */
export function PersonTag({
  name,
  colorClass,
  className,
}: {
  name: string;
  colorClass: string;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn("border-transparent font-medium", colorClass, className)}>
      {name}
    </Badge>
  );
}
