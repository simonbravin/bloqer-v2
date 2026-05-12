import { Suspense } from "react";
import { LoginForm } from "@/features/auth/components/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Iniciar sesión</CardTitle>
        <CardDescription>Accedé a tu cuenta de Bloqer</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<div className="h-10 w-full animate-pulse rounded-md bg-muted" />}>
          <LoginForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
