"use client";

import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useTranscriptionProgress } from "@/hooks/use-transcription-progress";

interface TranscriptionProgressBannerProps {
    /** Called when a running transcription finishes (e.g. to refresh the list). */
    onFinished?: () => void;
}

function formatElapsed(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    return minutes > 0
        ? `${minutes}m ${totalSeconds % 60}s`
        : `${totalSeconds}s`;
}

export function TranscriptionProgressBanner({
    onFinished,
}: TranscriptionProgressBannerProps) {
    const { running, progress } = useTranscriptionProgress({ onFinished });
    if (running.length === 0) return null;

    const job = running[0];
    return (
        <div
            role="status"
            aria-live="polite"
            className="mb-4 rounded-lg border bg-muted/40 p-4"
        >
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Transcribing
                    {running.length > 1 ? ` (${running.length} jobs)` : ""}…
                </span>
                <span className="tabular-nums text-muted-foreground">
                    {progress === null ? "Starting…" : `${progress}%`} ·{" "}
                    {formatElapsed(job.elapsedSeconds)}
                </span>
            </div>
            <Progress value={progress ?? 3} />
            <p className="mt-2 text-xs text-muted-foreground">
                This runs on the server, so it is safe to reload this page.
            </p>
        </div>
    );
}
