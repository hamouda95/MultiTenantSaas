import type { QueryClient } from "@tanstack/react-query";
/** Poll small authorized metadata; fetch the full ledger only after a version or permission change. */
export async function versionedQuery<T extends { version: number }>(
  client: QueryClient,
  key: readonly unknown[],
  head: () => Promise<{ version: number; scopeTag: string }>,
  snapshot: () => Promise<T>,
  busy: () => boolean,
): Promise<T> {
  const meta = await head();
  const cached = client.getQueryData<T>(key);
  const scopeKey = ["snapshot-scope", ...key];
  const matchingScope = client.getQueryData<string>(scopeKey) === meta.scopeTag;
  if (cached && matchingScope && (busy() || cached.version === meta.version))
    return cached;
  const fresh = await snapshot();
  const latest = client.getQueryData<T>(key);
  client.setQueryData(scopeKey, meta.scopeTag);
  return matchingScope && latest && latest.version > fresh.version
    ? latest
    : fresh;
}
