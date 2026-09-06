import { createFileRoute } from "@tanstack/react-router";
import { SignInGate } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { AuthScreen } from "@/components/desk/auth-screen";
import { DeskSync } from "@/components/desk/desk-sync";
import { Desk } from "@/components/desk/desk";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-4 text-foreground">
        <div className="w-full max-w-md">
          <p className="font-serif text-2xl">锋口</p>
          <p className="mt-2 text-sm text-muted-foreground">正在确认账户</p>
          <Skeleton className="mt-6 h-72 w-full" />
        </div>
      </div>
    );
  }
  return (
    <SignInGate fallback={<AuthScreen />}>
      <DeskSync>
        <Desk />
      </DeskSync>
    </SignInGate>
  );
}
