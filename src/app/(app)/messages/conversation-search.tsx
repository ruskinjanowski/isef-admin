"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

// Search box for the conversation list. The query lives in the URL (`q`) so the
// server page does the filtering; typing is debounced and resets to page 1.
export function ConversationSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initial);

  useEffect(() => {
    const id = setTimeout(() => {
      const q = value.trim();
      if (q === initial) return;
      router.replace(q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname);
    }, 300);
    return () => clearTimeout(id);
  }, [value, initial, pathname, router]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Search name or phone…"
        className="pl-9"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  );
}
