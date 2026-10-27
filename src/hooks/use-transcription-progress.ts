"use client";

import { useEffect, useRef, useState } from "react";

export interface TranscriptionProgress {
    available: boolean;
    running: { elapsedSeconds: number; megabytes: number }[];
    progress: number | null;
}

const IDLE: TranscriptionProgress = {
    available: false,
    running: [],
    progress: null,
};

interface Options {
    /** Called once when a running transcription finishes. */
    onFinished?: () => void;
}

/**
 * Polls the server for the transcription provider's live progress. Because
 * the source of truth is the provider, progress shows up after a reload and
 * in other tabs. Polls fast while a job runs, slowly when idle, and backs off
 * when the provider doesn't report progress.
 */
export function useTranscriptionProgress({ onFinished }: Options = {}) {
    const [state, setState] = useState<TranscriptionProgress>(IDLE);
    const wasRunning = useRef(false);
    const onFinishedRef = useRef(onFinished);
    onFinishedRef.current = onFinished;

    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const tick = async () => {
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
                        const running = next.running.length > 0;
                        if (wasRunning.current && !running) {
                            onFinishedRef.current?.();
                        }
                        wasRunning.current = running;
                        delay = !next.available ? 60000 : running ? 2000 : 5000;
                    }
                } catch {
                    // Transient network error: try again on the next tick.
                }
            }
            if (!cancelled) timer = setTimeout(tick, delay);
        };

        tick();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, []);

    return state;
}
