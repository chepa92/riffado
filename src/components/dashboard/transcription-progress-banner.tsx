"use client";

import { Loader2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
    type RecentTranscriptionJob,
    type TranscriptionJob,
    useTranscriptionProgress,
} from "@/hooks/use-transcription-progress";

interface TranscriptionProgressBannerProps {
    /** Called when the last active transcription finishes (e.g. to refresh the list). */
    onFinished?: () => void;
}

function formatElapsed(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    return minutes > 0
        ? `${minutes}m ${totalSeconds % 60}s`
        : `${totalSeconds}s`;
}

const RECENT_LABELS: Record<string, string> = {
    done: "Done",
    failed: "Failed",
    cancelled: "Cancelled",
};

function JobRow({
    job,
    cancelling,
    onCancel,
}: {
    job: TranscriptionJob;
    cancelling: boolean;
    onCancel: (id: string) => void;
}) {
    const running = job.state === "running";
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2 font-medium">
                    {running ? (
                        <Loader2
                            className="h-4 w-4 shrink-0 animate-spin"
                            aria-hidden
                        />
                    ) : null}
                    <span className="truncate">{job.name ?? "Recording"}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums text-muted-foreground">
                        {cancelling
                            ? "Cancelling…"
                            : running
                              ? `${job.progress === null ? "Starting…" : `${job.progress}%`} · ${formatElapsed(job.elapsedSeconds)}${job.etaSeconds === null ? "" : ` · ETA ~${formatElapsed(job.etaSeconds)}`}`
                              : job.startsInSeconds === null
                                ? `Queued · waiting ${formatElapsed(job.elapsedSeconds)}`
                                : `Queued · starts in ~${formatElapsed(job.startsInSeconds)}${job.etaSeconds === null ? "" : ` · done in ~${formatElapsed(job.etaSeconds)}`}`}
                    </span>
                    {job.id ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={cancelling}
                            onClick={() => onCancel(job.id)}
                            aria-label={`Cancel transcription of ${job.name ?? "recording"}`}
                        >
                            <X className="h-4 w-4" aria-hidden />
                            Cancel
                        </Button>
                    ) : null}
                </span>
            </div>
            {running ? <Progress value={job.progress ?? 3} /> : null}
        </div>
    );
}

function RecentList({ recent }: { recent: RecentTranscriptionJob[] }) {
    if (recent.length === 0) return null;
    return (
        <details className="mt-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">
                Recent transcriptions ({recent.length})
            </summary>
            <ul className="mt-2 space-y-1">
                {recent.map((job) => (
                    <li
                        key={`${job.id}-${job.finished}`}
                        className="flex justify-between gap-3"
                    >
                        <span className="truncate">{job.name ?? "Recording"}</span>
                        <span className="shrink-0 tabular-nums">
                            {RECENT_LABELS[job.state] ?? job.state} ·{" "}
                            {formatElapsed(job.seconds)} · {job.finished}
                        </span>
                    </li>
                ))}
            </ul>
        </details>
    );
}

export function TranscriptionProgressBanner({
    onFinished,
}: TranscriptionProgressBannerProps) {
    const { jobs, recent, refresh } = useTranscriptionProgress({ onFinished });
    const [cancelling, setCancelling] = useState<Set<string>>(new Set());

    const cancelJob = async (id: string) => {
        setCancelling((prev) => new Set(prev).add(id));
        try {
            const res = await fetch("/api/transcription/cancel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            if (!res.ok) {
                const error = (await res.json().catch(() => ({}))) as {
                    error?: string;
                };
                toast.error(error.error || "Could not cancel transcription");
            } else {
                toast.success("Transcription cancelled");
            }
        } catch {
            toast.error("Could not cancel transcription");
        } finally {
            setCancelling((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            refresh();
        }
    };

    if (jobs.length === 0 && recent.length === 0) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            className="mb-4 rounded-lg border bg-muted/40 p-4"
        >
            {jobs.length > 0 ? (
                <div className="space-y-4">
                    {jobs.map((job) => (
                        <JobRow
                            key={job.id || job.name}
                            job={job}
                            cancelling={cancelling.has(job.id)}
                            onCancel={cancelJob}
                        />
                    ))}
                    <p className="text-xs text-muted-foreground">
                        This runs on the server, so it is safe to reload this
                        page.
                    </p>
                </div>
            ) : null}
            <RecentList recent={recent} />
        </div>
    );
}
