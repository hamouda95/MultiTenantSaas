// Read-only live smoke. Never creates accounts, purchases or payments.
(async () => {
  const origin = process.argv[2];
  if (!origin || new URL(origin).protocol !== "https:")
    throw Error(
      "Usage: node scripts/check-deployment.cjs https://your-service.onrender.com",
    );
  for (const [path, status] of [
    ["/login", 200],
    ["/health/ready", 200],
    ["/api/v1/auth/me", 401],
  ]) {
    const r = await fetch(new URL(path, origin), {
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    if (r.status !== status)
      throw Error(`${path}: expected ${status}, got ${r.status}`);
    console.log(`${path}: ${r.status}`);
  }
  console.log(
    "Public HTTP smoke passed. Role grants, backups and authenticated workflows require account-side verification.",
  );
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
