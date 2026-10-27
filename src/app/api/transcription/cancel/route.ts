import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { apiCredentials } from "@/db/schema";
import { requireApiSession } from "@/lib/auth-server";
import { decrypt } from "@/lib/encryption";
import { env } from "@/lib/env";
import { AppError, apiHandler, ErrorCode } from "@/lib/errors";

// Job ids are the sha256 of the audio, as reported by the provider's /status.json.
const JOB_ID = /^[0-9a-f]{64}$/;

/**
 * Cancel a queued or running transcription job on the user's default
 * transcription provider (`POST <origin>/v1/jobs/<id>/cancel`). Self-host only.
 */
export const POST = apiHandler(async (request: Request) => {
    const session = await requireApiSession(request);

    if (env.IS_HOSTED) {
        throw new AppError(
            ErrorCode.NOT_FOUND,
            "Cancelling is only available on self-hosted installs",
            404,
        );
    }

    const body = (await request.json().catch(() => ({}))) as {
        id?: unknown;
    };
    if (typeof body.id !== "string" || !JOB_ID.test(body.id)) {
        throw new AppError(
            ErrorCode.INVALID_INPUT,
            "A valid job id is required",
            400,
            { field: "id" },
        );
    }

    const [credential] = await db
        .select({
            baseUrl: apiCredentials.baseUrl,
            apiKey: apiCredentials.apiKey,
        })
        .from(apiCredentials)
        .where(
            and(
                eq(apiCredentials.userId, session.user.id),
                eq(apiCredentials.isDefaultTranscription, true),
            ),
        )
        .limit(1);
    if (!credential?.baseUrl) {
        throw new AppError(
            ErrorCode.NOT_FOUND,
            "No transcription provider is configured",
            404,
        );
    }

    const origin = new URL(credential.baseUrl).origin;
    const res = await fetch(`${origin}/v1/jobs/${body.id}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${decrypt(credential.apiKey)}` },
        // Cancelling the running job restarts the transcriber, which takes a moment.
        signal: AbortSignal.timeout(40_000),
    }).catch(() => null);

    if (!res) {
        throw new AppError(
            ErrorCode.INVALID_INPUT,
            "The transcription provider could not be reached",
            502,
        );
    }
    if (res.status === 404) {
        throw new AppError(
            ErrorCode.NOT_FOUND,
            "That job is no longer queued or running",
            404,
        );
    }
    if (!res.ok) {
        throw new AppError(
            ErrorCode.INVALID_INPUT,
            "The provider does not support cancelling",
            502,
        );
    }

    const data = (await res.json().catch(() => ({}))) as { state?: string };
    return NextResponse.json({ state: data.state ?? "cancelling" });
});
