import type { RecordingMark } from "@/lib/plaud/marks";

// How much transcript to show around each mark: the thought that made the
// speaker press the button usually came just before it.
const SECONDS_BEFORE = 45;
const SECONDS_AFTER = 30;
const MAX_LINES_PER_MARK = 14;

export function formatClock(timestampMs: number): string {
    const total = Math.floor(timestampMs / 1000);
    const hours = Math.floor(total / 3600);
    const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Start time of a `[mm:ss]` / `[h:mm:ss]` transcript line, in seconds. */
function lineSeconds(line: string): number | null {
    const match = /^\[(?:(\d+):)?(\d{1,2}):(\d{2})\]/.exec(line);
    if (!match) return null;
    return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/**
 * A block for the summary prompt that tells the model which moments the user
 * flagged as important, with the transcript around each one. Returns "" when
 * there are no marks. Works best with timestamped transcript lines; without
 * them it still lists the times.
 */
export function buildMarksContext(
    marks: RecordingMark[],
    transcript: string,
): string {
    if (marks.length === 0) return "";

    const lines = transcript.split("\n").map((line) => ({
        line,
        seconds: lineSeconds(line),
    }));
    const timestamped = lines.some((entry) => entry.seconds !== null);

    const sections = marks.map((mark) => {
        const at = mark.timestampMs / 1000;
        const title = `- ${formatClock(mark.timestampMs)}${mark.text ? ` (note: ${mark.text})` : ""}`;
        if (!timestamped) return title;
        const around = lines
            .filter(
                ({ seconds }) =>
                    seconds !== null &&
                    seconds >= at - SECONDS_BEFORE &&
                    seconds <= at + SECONDS_AFTER,
            )
            .slice(0, MAX_LINES_PER_MARK)
            .map(({ line }) => `    ${line}`);
        return around.length ? `${title}\n${around.join("\n")}` : title;
    });

    return [
        "",
        "",
        "The speaker pressed the recorder's highlight button at the moments listed below, so",
        "they are the parts the user considers most important. Make sure the summary, key points",
        "and action items cover what was said around each of them, and give them priority.",
        timestamped
            ? "Times are offsets into the recording; transcript lines start with their own [time]."
            : "The transcript has no timestamps, so only the times are known.",
        "",
        ...sections,
    ].join("\n");
}
