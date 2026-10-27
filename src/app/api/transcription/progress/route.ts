import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { apiCredentials } from "@/db/schema";
import { requireApiSession } from "@/lib/auth-server";
import { env } from "@/lib/env";
import { apiHandler } from "@/lib/errors";

// Shape served by a self-hosted transcription gateway at `<origin>/status.json`
// (e.g. a whisper.cpp wrapper). Providers that don't serve it just report
// `available: false` and the UI shows nothing.
interface ProviderStatus {
    running?: { elapsed?: number; mb?: number }[];
    progress?: number | null;
}

/**
 * Live progress of the user's default transcription provider. The state lives
 * on the provider, not in the browser, so it survives a page reload.
 */
export const GET = apiHandler(async (request: Request) => {
    const session = await requireApiSession(request);

    const unavailable = NextResponse.json({
        available: false,
        running: [],
        progress: null,
    });

    // The base URL is user-controlled; never fetch it from the hosted app.
    if (env.IS_HOSTED) return unavailable;

    const [credential] = await db
        .select({ baseUrl: apiCredentials.baseUrl })
        .from(apiCredentials)
        .where(
            and(
                eq(apiCredentials.userId, session.user.id),
                eq(apiCredentials.isDefaultTranscription, true),
            ),
        )
        .limit(1);
    if (!credential?.baseUrl) return unavailable;

    try {
        const origin = new URL(credential.baseUrl).origin;
        const res = await fetch(`${origin}/status.json`, {
            signal: AbortSignal.timeout(2000),
            cache: "no-store",
        });
        if (!res.ok) return unavailable;

        const data = (await res.json()) as ProviderStatus;
        const running = Array.isArray(data.running)
            ? data.running.map((job) => ({
                  elapsedSeconds: Number(job.elapsed) || 0,
                  megabytes: Number(job.mb) || 0,
              }))
            : [];
        const progress =
            typeof data.progress === "number"
                ? Math.min(100, Math.max(0, Math.round(data.progress)))
                : null;

        return NextResponse.json({ available: true, running, progress });
    } catch {
        return unavailable;
    }
});
