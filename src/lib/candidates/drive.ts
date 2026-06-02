// Helpers for the Google Drive links stored in the sheet (CVs, cover letters,
// photos). The sheet stores share links like
// `https://drive.google.com/open?id=ID` or `.../file/d/ID/view`; these pull the
// file id out and build a browser-loadable thumbnail URL.
//
// Note: the underlying files are shared with the *service account*, not made
// public, so the thumbnail URL may 403 in the browser. The UI falls back to a
// plain "open in Drive" link; reliable in-app rendering needs a service-account
// proxy (added when the Google integration lands — see CLAUDE.md).

/** Extract the Drive file id from any of the common share-link shapes. */
export function driveFileId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/d\/([-\w]+)/) ?? url.match(/[?&]id=([-\w]+)/);
  return match ? match[1] : null;
}

/** A browser-loadable thumbnail URL for a Drive image link, or null. */
export function driveThumbnailUrl(url: string, sizePx = 1000): string | null {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w${sizePx}` : null;
}
