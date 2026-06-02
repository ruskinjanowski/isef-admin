import Image from "next/image";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/access";
import { SignOutButton } from "@/components/sign-out-button";

// Holding page for accounts that have a session but no access yet. Lives outside
// the (app) route group so it has no sidebar and bypasses the approved-only gate
// in (app)/layout.tsx — otherwise a pending user would bounce here in a loop.
export default async function PendingPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  // Already cleared — don't strand an approved user on the holding page.
  if (user.status === "approved") {
    redirect("/");
  }

  const disabled = user.status === "disabled";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <Image
          src="/isef-logo.png"
          alt="ISEF"
          width={614}
          height={192}
          priority
          className="mx-auto h-10 w-auto"
        />
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {disabled ? "Access revoked" : "Account pending approval"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {disabled
              ? "Your account no longer has access to ISEF Admin. Contact an administrator if you think this is a mistake."
              : "Your account has been created but needs an administrator to approve it before you can sign in. You'll have access as soon as that's done."}
          </p>
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="font-medium">{user.email}</span>.
          </p>
        </div>
        <div className="flex justify-center">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
