import { NextResponse } from "next/server";

type Params = {
  params: Promise<{ programId: string }>;
};

export async function POST(request: Request, context: Params) {
  const { programId } = await context.params;
  const verifierUrl = process.env.VERIFIER_URL ?? "http://127.0.0.1:8081";
  const body = await request
    .json()
    .catch(() => ({ triggeredBy: "manual" })) as { triggeredBy?: "manual" | "scheduled" | "traffic_hot" | "post_upgrade" };

  const response = await fetch(
    `${verifierUrl}/internal/v1/verifications/${encodeURIComponent(programId)}/run`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        triggeredBy: body.triggeredBy ?? "manual"
      }),
      cache: "no-store"
    }
  );

  const payload = await response.json().catch(() => ({
    error: "invalid_response",
    message: "Verifier returned non-JSON response"
  }));

  return NextResponse.json(payload, { status: response.status });
}

