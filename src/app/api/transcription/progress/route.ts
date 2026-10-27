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
interface ProviderJob {
    id?: string;
    name?: string;
    state?: string;
    mb?: number;
    elapsed?: number;
    progress?: number | null;
    /** Audio length in seconds, when the provider could read it. */
    duration?: number | null;
    /** Estimated seconds until this job is finished. */
    eta?: number | null;
    /** Estimated seconds until this job starts (queued jobs). */
    starts_in?: number | null;
}

interface ProviderRecent {
    id?: string;
    name?: string;
    state?: string;
    seconds?: number;
    finished?: string;
}

interface ProviderStatus {
    jobs?: ProviderJob[];
    recent?: ProviderRecent[];
    // Older gateways only report a bare list of running jobs.
    running?: { id?: string; elapsed?: number; mb?: number }[];
    progress?: number | null;
}

function clampProgress(value: unknown): number | null {
    return typeof value === "number"
        ? Math.min(100, Math.max(0, Math.round(value)))
        : null;
}

/**
 * Live status of every transcription job on the user's default transcription
 * provider (queued, running, and recently finished). The state lives on the
 * provider, not in the browser, so it survives a page reload.
 */
export const GET = apiHandler(async (request: Request) => {
    const session = await requireApiSession(request);

    const unavailable = NextResponse.json({
        available: false,
        jobs: [],
        recent: [],
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

        const providerJobs: ProviderJob[] = Array.isArray(data.jobs)
            ? data.jobs
            : (data.running ?? []).map((job) => ({
                  ...job,
                  state: "running",
                  progress: data.progress,
              }));

        const jobs = providerJobs.map((job) => ({
            id: typeof job.id === "string" ? job.id : "",
            name: typeof job.name === "string" && job.name ? job.name : null,
            state: job.state === "queued" ? "queued" : "running",
            elapsedSeconds: Number(job.elapsed) || 0,
            megabytes: Number(job.mb) || 0,
            progress: clampProgress(job.progress),
            durationSeconds:
                typeof job.duration === "number" ? job.duration : null,
            etaSeconds: typeof job.eta === "number" ? job.eta : null,
            startsInSeconds:
                typeof job.starts_in === "number" ? job.starts_in : null,
        }));

        const recent = (Array.isArray(data.recent) ? data.recent : [])
            .slice(0, 5)
            .map((job) => ({
                id: typeof job.id === "string" ? job.id : "",
                name:
                    typeof job.name === "string" && job.name ? job.name : null,
                state: typeof job.state === "string" ? job.state : "done",
                seconds: Number(job.seconds) || 0,
                finished: typeof job.finished === "string" ? job.finished : "",
            }));

        return NextResponse.json({ available: true, jobs, recent });
    } catch {
        return unavailable;
    }
});
