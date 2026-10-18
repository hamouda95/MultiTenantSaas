// Operator-only, first administrator bootstrap; never an HTTP self-promotion endpoint.
const { Client } = require("../apps/api/node_modules/pg");
(async () => {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || process.argv[3] !== email || !process.env.DATABASE_ADMIN_URL)
    throw Error(
      "Set DATABASE_ADMIN_URL to a schema operator connection; pass the registered email twice.",
    );
  const db = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await db.connect();
  try {
    await db.query("BEGIN");
    await db.query("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");
    const role = await db.query(
      "SELECT rolsuper,rolcreaterole FROM pg_roles WHERE rolname=current_user",
    );
    if (!role.rows[0]?.rolsuper && !role.rows[0]?.rolcreaterole)
      throw Error("Schema operator role required");
    if (
      (await db.query("SELECT id FROM users WHERE is_platform_admin=true")).rows
        .length
    )
      throw Error(
        "A platform administrator already exists; bootstrap is disabled",
      );
    const r = await db.query(
      "UPDATE users SET is_platform_admin=true,updated_at=NOW() WHERE email=$1 AND status='ACTIVE' RETURNING id",
      [email],
    );
    if (r.rows.length !== 1)
      throw Error("Create and verify the intended active account first");
    await db.query("COMMIT");
    console.log(
      "First platform administrator assigned. Record this operator action in your deployment audit.",
    );
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    await db.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
