import Image from "next/image";
import { Suspense } from "react";
import { LoginForm } from "@/features/auth/components/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <Card className="w-full max-w-sm border-border/80 shadow-md">
      <CardHeader className="space-y-4 text-center sm:text-left">
        <div className="flex justify-center sm:justify-start">
          <Image
            src="/bloqer-logo.png"
            alt="Bloqer"
            width={180}
            height={52}
            priority
            className="h-10 w-auto max-w-[11rem] object-contain object-left"
          />
        </div>
        <div className="space-y-1">
          <CardTitle className="text-2xl font-bold">Iniciar sesión</CardTitle>
          <CardDescription>Accedé a tu cuenta de Bloqer</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<div className="h-10 w-full animate-pulse rounded-md bg-muted" />}>
          <LoginForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
