/** An app's picture, when it is on the web: files on the server machine aren't reachable from a phone. */
export function appImageUrl(image: string | null | undefined): string | null {
  return image && /^https?:\/\//i.test(image) ? image : null;
}
