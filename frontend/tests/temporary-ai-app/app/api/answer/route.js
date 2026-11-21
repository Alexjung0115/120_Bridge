// TEMPORARY (#4): Loopback proxy for the synthetic AI2 contract. Remove on real integration.
export async function POST(request) {
  const origin = process.env.BRIDGE_TEMPORARY_AI_URL
  const token = process.env.AI_INTERNAL_TOKEN
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin ?? "") || !token) {
    return Response.json({ detail: { code: "ai_unavailable" } }, { status: 503 })
  }

  try {
    const upstream = await fetch(`${origin}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: await request.text(),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    })
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    const timedOut = error.name === "TimeoutError"
    return Response.json(
      { detail: { code: timedOut ? "ai_timeout" : "ai_unavailable" } },
      { status: timedOut ? 504 : 503 },
    )
  }
}
