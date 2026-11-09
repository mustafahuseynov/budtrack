import { Input } from "~/components/ui/input";
import { formatCents } from "~/lib/money";
import { cn } from "~/lib/utils";

type PlanCellProps = {
  editing: boolean;
  cents: number;
  hintCents?: number | null;
  value: string;
  label: string;
  error?: string | null;
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
};

export function PlanCell({
  editing,
  cents,
  hintCents,
  value,
  label,
  error,
  onChange,
  onBlur,
}: PlanCellProps) {
  const hint = hintCents !== null && hintCents !== undefined && hintCents > 0 ? hintCents : null;

  if (!editing) {
    return (
      <span
        className={cn("block text-right text-sm tabular-nums", error && "text-destructive")}
        title={error ?? undefined}
      >
        {formatCents(cents)}
      </span>
    );
  }

  const showHint = hint !== null && value.trim() === "";

  return (
    <div className="relative">
      {showHint ? null : (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-muted-foreground"
        >
          €
        </span>
      )}
      <Input
        value={value}
        inputMode="decimal"
        placeholder={showHint ? `≈ ${formatCents(hint)}` : "0.00"}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        title={
          error ??
          (showHint ? "Suggested savings for this month to reach the goal on time" : undefined)
        }
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onBlur(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        className={cn(
          "h-9 w-full rounded-md border-0 bg-background/40 px-2 text-right text-sm tabular-nums shadow-none",
          "placeholder:text-xs",
          "ring-1 ring-inset ring-input/60 hover:ring-input",
          "focus-visible:ring-2 focus-visible:ring-ring",
          error && "text-destructive ring-destructive/60 focus-visible:ring-destructive",
          showHint ? "pl-2" : "pl-5",
        )}
      />
    </div>
  );
}
