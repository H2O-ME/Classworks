const UPSTREAM_ENDPOINT = "https://api.tianhw.top/v1/chat/completions";

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "POST, OPTIONS",
    },
  });
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const apiKey = String(body?.apiKey || "").trim();
    const model = String(body?.model || "").trim();
    const systemPrompt = String(body?.systemPrompt || "").trim();
    const userPrompt = String(body?.userPrompt || "").trim();

    if (!apiKey || !model || !systemPrompt || !userPrompt) {
      return Response.json(
        {
          error: {
            code: "AI_POLISH_PROXY_REQUEST_INVALID",
            message: "Missing required AI polish payload fields.",
          },
        },
        { status: 400 }
      );
    }

    const upstreamResponse = await fetch(UPSTREAM_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        chat_template_kwargs: { enable_thinking: false },
        reasoning_effort: "low",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    const responseText = await upstreamResponse.text();
    const responseHeaders = new Headers({
      "Content-Type": upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });

    return new Response(responseText, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return Response.json(
      {
        error: {
          code: "AI_POLISH_NETWORK_ERROR",
          message: error instanceof Error ? error.message : "Unknown proxy error",
        },
      },
      { status: 502 }
    );
  }
}
