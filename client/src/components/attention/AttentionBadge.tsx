import { Badge } from "@/components/ui/badge";

interface AttentionBadgeProps {
  count: number;
  className?: string;
}

/**
 * Displays a numeric badge for attention count.
 * Hidden when count is 0; capped at "9+" for counts over 9.
 */
export function AttentionBadge({ count, className }: AttentionBadgeProps) {
  if (count === 0) return null;

  const display = count > 9 ? "9+" : String(count);

  return (
    <Badge
      variant="destructive"
      className={className}
      aria-label={`${count} needs attention`}
    >
      {display}
    </Badge>
  );
}
