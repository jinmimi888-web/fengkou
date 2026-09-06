import { createFileRoute, Navigate } from "@tanstack/react-router";
import { SignInGate } from "@/lib/auth/gates";
import { AuthScreen } from "@/components/desk/auth-screen";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <SignInGate fallback={<AuthScreen />}>
      <Navigate to="/" />
    </SignInGate>
  );
}
