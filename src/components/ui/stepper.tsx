import { Check } from "lucide-react";

export type StepperStep = { id: string; label: string };

export function Stepper({ steps, current }: { steps: StepperStep[]; current: string }) {
  const idx = steps.findIndex((s) => s.id === current);
  return (
    <ol className="flex items-center gap-1 sm:gap-2 text-xs overflow-x-auto">
      {steps.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <li key={s.id} className="flex items-center gap-2 whitespace-nowrap">
            <span
              className={
                "inline-flex size-6 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors " +
                (done
                  ? "bg-primary text-primary-foreground border-primary"
                  : active
                  ? "border-foreground text-foreground bg-background"
                  : "border-border text-muted-foreground bg-background")
              }
            >
              {done ? <Check className="size-3" /> : i + 1}
            </span>
            <span
              className={
                "text-[11px] sm:text-xs " +
                (active || done ? "text-foreground font-medium" : "text-muted-foreground")
              }
            >
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="mx-1 h-px w-4 sm:w-8 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}