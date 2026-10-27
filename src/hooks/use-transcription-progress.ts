"use client";

import { useEffect, useRef, useState } from "react";

export interface TranscriptionJob {
    id: string;
    name: string | null;
    state: "queued" | "running";
    elapsedSeconds: number;
    megabytes: number;
    progress: number | null;
    durationSeconds: number | null;
    /** Estimated seconds until this job is finished. */
    etaSeconds: number | null;
    /** Estimated seconds until a queued job starts. */
    startsInSeconds: number | null;
}

export interface RecentTranscriptionJob {
    id: string;
    name: string | null;
    state: string;
    seconds: number;
    finished: string;
}

export interface TranscriptionProgress {
    available: boolean;
    jobs: TranscriptionJob[];
    recent: RecentTranscriptionJob[];
}

const IDLE: TranscriptionProgress = { available: false, jobs: [], recent: [] };

interface Options {
    /** Called once when the last active transcription finishes. */
    onFinished?: () => void;
}

/**
 * Polls the server for the transcription provider's live job list. Because
 * the source of truth is the provider, jobs show up after a reload and in
 * other tabs. Polls fast while jobs are active, slowly when idle, and backs
 * off when the provider doesn't report status.
 */
export function useTranscriptionProgress({ onFinished }: Options = {}) {
    const [state, setState] = useState<TranscriptionProgress>(IDLE);
    const wasActive = useRef(false);
    const refreshNow = useRef<() => void>(() => {});
    const onFinishedRef = useRef(onFinished);
    onFinishedRef.current = onFinished;

    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const tick = async () => {
            if (timer) clearTimeout(timer);
            let delay = 5000;
            if (document.visibilityState === "visible") {
                try {
                    const res = await fetch("/api/transcription/progress", {
                        cache: "no-store",
                    });
                    if (res.ok) {
                        const next = (await res.json()) as TranscriptionProgress;
                        if (cancelled) return;
                        setState(next);
                        const active = next.jobs.length > 0;
                        if (wasActive.current && !active) {
                            onFinishedRef.current?.();
                        }
                        wasActive.current = active;
                        delay = !next.available ? 60000 : active ? 2000 : 5000;
                    }
                } catch {
                    // Transient network error: try again on the next tick.
                }
            }
            if (!cancelled) timer = setTimeout(tick, delay);
        };

        refreshNow.current = tick;
        tick();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, []);

    return { ...state, refresh: () => refreshNow.current() };
}
