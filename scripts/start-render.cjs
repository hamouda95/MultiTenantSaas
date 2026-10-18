// One Render web service: public Next.js, loopback-only NestJS, shared lifecycle.
const { spawn } = require("node:child_process");
const origin = process.env.WEB_URL || process.env.RENDER_EXTERNAL_URL;
if (!origin || !/^https:\/\/[^/]+$/.test(origin)) {
  console.error(
    "Set WEB_URL to the exact public HTTPS origin, without a trailing slash.",
  );
  process.exit(1);
}
const port = process.env.PORT || "10000";
if (port === "4000") {
  console.error("Public PORT must differ from private API port 4000");
  process.exit(1);
}
const common = { ...process.env, NODE_ENV: "production", WEB_URL: origin };
const children = [
  spawn(process.execPath, ["apps/api/dist/main.js"], {
    stdio: "inherit",
    env: { ...common, PORT: "4000", API_HOST: "127.0.0.1" },
  }),
  spawn(process.execPath, ["apps/web/.next/standalone/apps/web/server.js"], {
    stdio: "inherit",
    env: {
      ...common,
      PORT: port,
      HOSTNAME: "0.0.0.0",
      API_INTERNAL_URL: "http://127.0.0.1:4000",
    },
  }),
];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  children.forEach((c) => c.kill("SIGTERM"));
  const timer = setTimeout(() => {
    children.forEach((c) => c.kill("SIGKILL"));
    process.exit(code);
  }, 10000);
  timer.unref();
  Promise.all(
    children.map((c) =>
      c.exitCode !== null
        ? Promise.resolve()
        : new Promise((r) => c.once("exit", r)),
    ),
  ).then(() => process.exit(code));
}
for (const child of children) {
  child.on("error", () => stop(1));
  child.on("exit", (code) => {
    if (!stopping) stop(code || 1);
  });
}
process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));
