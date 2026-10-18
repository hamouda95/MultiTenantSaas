export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const response = await fetch(
      new URL(
        "/health/ready",
        process.env.API_INTERNAL_URL || "http://localhost:4000",
      ),
      { cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    return Response.json(
      { status: response.ok ? "ready" : "unavailable" },
      {
        status: response.ok ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
