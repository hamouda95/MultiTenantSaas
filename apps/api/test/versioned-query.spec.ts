import { describe, it, expect } from "vitest";
import { versionedQuery } from "../../web/src/lib/versioned-query";
function cache() {
  const values = new Map<string, unknown>();
  return {
    getQueryData: (key: readonly unknown[]) => values.get(JSON.stringify(key)),
    setQueryData: (key: readonly unknown[], data: unknown) =>
      values.set(JSON.stringify(key), data),
  };
}
describe("Authorized version polling", () => {
  it("does not download an unchanged ledger", async () => {
    const client = cache(),
      key = ["business", "demo"];
    client.setQueryData(key, { version: 10, salary: 100 });
    client.setQueryData(["snapshot-scope", ...key], "scope-a");
    let reads = 0;
    const result = await versionedQuery(
      client as any,
      key,
      async () => ({ version: 10, scopeTag: "scope-a" }),
      async () => {
        reads++;
        return { version: 10, salary: 100 };
      },
      () => false,
    );
    expect(reads).toBe(0);
    expect(result.version).toBe(10);
  });
  it("replaces personal data after permission changes even when the version is unchanged", async () => {
    const client = cache(),
      key = ["business", "demo"];
    client.setQueryData(key, { version: 10, employees: ["private"] });
    client.setQueryData(["snapshot-scope", ...key], "owner");
    const result = await versionedQuery(
      client as any,
      key,
      async () => ({ version: 10, scopeTag: "viewer" }),
      async () => ({ version: 10, employees: [] }),
      () => true,
    );
    expect(result.employees).toEqual([]);
  });
  it("never falls back to private cached data when authorization fails", async () => {
    const client = cache(),
      key = ["business", "demo"];
    client.setQueryData(key, { version: 10, employees: ["private"] });
    await expect(
      versionedQuery(
        client as any,
        key,
        async () => {
          throw Error("Forbidden");
        },
        async () => ({ version: 10 }),
        () => false,
      ),
    ).rejects.toThrow("Forbidden");
  });
  it("does not overwrite a newer command response with an older in-flight snapshot", async () => {
    const client = cache(),
      key = ["business", "demo"];
    client.setQueryData(key, { version: 10 });
    client.setQueryData(["snapshot-scope", ...key], "scope");
    const result = await versionedQuery(
      client as any,
      key,
      async () => ({ version: 11, scopeTag: "scope" }),
      async () => {
        client.setQueryData(key, { version: 12 });
        return { version: 11 };
      },
      () => false,
    );
    expect(result.version).toBe(12);
  });
});
