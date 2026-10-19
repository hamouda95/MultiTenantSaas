// Deterministic Code 128-B camera input for Chromium's fake video device.
// Exercises the actual video decoder without accessing a physical camera.
const fs = require("node:fs"),
  path = require("node:path");
module.exports = function cameraFixture(file, text) {
  const browserEntry =
    require.resolve("../apps/web/node_modules/@zxing/browser");
  const { Code128Reader } = require(
    require.resolve("@zxing/library", { paths: [path.dirname(browserEntry)] }),
  );
  const codes = [...text].map((c) => c.charCodeAt(0) - 32);
  if (codes.some((c) => c < 0 || c > 94))
    throw Error("Fixture requires printable ASCII");
  const checksum = (104 + codes.reduce((n, c, i) => n + c * (i + 1), 0)) % 103;
  const widths = [104, ...codes, checksum, 106].flatMap((c) =>
    Array.from(Code128Reader.CODE_PATTERNS[c]),
  );
  const w = 640,
    h = 480,
    scale = 4,
    y = Buffer.alloc(w * h, 235),
    uv = Buffer.alloc((w * h) / 2, 128);
  let x = Math.floor((w - widths.reduce((n, v) => n + v, 0) * scale) / 2),
    black = true;
  for (const width of widths) {
    if (black)
      for (let row = 100; row < 380; row++)
        y.fill(16, row * w + x, row * w + x + width * scale);
    x += width * scale;
    black = !black;
  }
  const frame = Buffer.concat([Buffer.from("FRAME\n"), y, uv]);
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from(`YUV4MPEG2 W${w} H${h} F5:1 Ip A1:1 C420jpeg\n`),
      ...Array(15).fill(frame),
    ]),
  );
};
