import { useMemo } from "react";
import {
  scorePassword,
  PASSWORD_MIN_SCORE,
  type PasswordScore,
} from "@/lib/password-policy";

// Re-export so existing imports from this module keep working.
export { scorePassword, type PasswordScore };

const LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"];
const TONES = [
  "bg-destructive",
  "bg-destructive",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-emerald-600",
];

export function PasswordStrength({ value }: { value: string }) {
  const score = useMemo(() => scorePassword(value), [value]);
  if (!value) return null;
  const passes = score >= PASSWORD_MIN_SCORE;
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={
              "h-1 flex-1 rounded-full transition-colors " +
              (i < score ? TONES[score] : "bg-muted")
            }
          />
        ))}
      </div>
      <p
        className={
          "text-xs " +
          (passes ? "text-muted-foreground" : "text-muted-foreground")
        }
      >
        {LABELS[score]} password
        {!passes && score > 0 ? " — add length, case mix, a number & symbol" : ""}
      </p>
    </div>
  );
}
