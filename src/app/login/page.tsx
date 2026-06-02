import Image from "next/image";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session) {
    redirect("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-3 text-center">
          <Image
            src="/isef-logo.png"
            alt="ISEF"
            width={614}
            height={192}
            priority
            className="mx-auto h-10 w-auto"
          />
          <h1 className="text-2xl font-semibold tracking-tight">
            Sign in to ISEF Admin
          </h1>
          <p className="text-sm text-muted-foreground">
            Use your email and password to access the admin console.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
