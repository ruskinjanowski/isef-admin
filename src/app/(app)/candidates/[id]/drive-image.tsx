"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";

// Renders a Drive photo thumbnail, falling back to a placeholder + link when the
// browser can't load it (the file is shared with the service account, not made
// public). See src/lib/candidates/drive.ts.
export function DriveImage({
  thumbnailUrl,
  viewUrl,
  alt,
}: {
  thumbnailUrl: string | null;
  viewUrl: string;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);

  if (thumbnailUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={thumbnailUrl}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="size-40 rounded-lg border object-cover"
      />
    );
  }

  return (
    <div className="flex size-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground">
      <ImageOff className="size-6" />
      {viewUrl ? (
        <a
          href={viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline"
        >
          View on Drive
        </a>
      ) : (
        <span className="text-xs">No photo</span>
      )}
    </div>
  );
}
