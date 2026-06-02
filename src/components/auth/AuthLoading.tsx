import { Skeleton } from "@/components/ui/skeleton";
import { PlatformShell } from "@/components/shells/PlatformShell";

export function AuthLoading() {
  return (
    <PlatformShell>
      <div className="mx-auto max-w-md px-6 py-16 space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-10 w-full mt-6" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </PlatformShell>
  );
}