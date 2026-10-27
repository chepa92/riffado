import type { PlaudContentItem, PlaudFileDetailResponse } from "@/types/plaud";

/** A moment the user marked with the recorder's highlight button. */
export interface RecordingMark {
    /** Offset into the recording, in milliseconds. */
    timestampMs: number;
    /** Plaud's mark type (4 = highlight button press). */
    type: number | null;
    /** Text Plaud attached to the mark, if any. */
    text: string | null;
}

// Plaud stores button presses as a `mark_memo` content item
// (data_title "Recording highlights").
const MARK_ITEM_TYPE = "mark_memo";

// Until Plaud has transcribed the recording its marks only carry this
// placeholder instead of real text.
const PLACEHOLDER = /^highlighted\.?\s+available after transcription/i;

export function selectMarkItem(
    detail: PlaudFileDetailResponse,
): PlaudContentItem | undefined {
    return detail.data?.content_list?.find(
        (item) => (item.data_type ?? "").toLowerCase() === MARK_ITEM_TYPE,
    );
}

function cleanText(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed && !PLACEHOLDER.test(trimmed) ? trimmed : null;
}

/**
 * Parse the `mark_memo` payload (an array of marks, possibly still a JSON
 * string) into sorted, de-duplicated marks. Unknown shapes yield `[]`.
 */
export function parseMarks(raw: unknown): RecordingMark[] {
    let list: unknown = raw;
    if (typeof list === "string") {
        try {
            list = JSON.parse(list);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(list)) return [];

    const byTime = new Map<number, RecordingMark>();
    for (const entry of list) {
        if (!entry || typeof entry !== "object") continue;
        const mark = entry as Record<string, unknown>;
        if (mark.is_user_deleted === true) continue;
        const timestampMs = Number(mark.timestamp);
        if (!Number.isFinite(timestampMs) || timestampMs < 0) continue;
        byTime.set(timestampMs, {
            timestampMs,
            type: typeof mark.mark_type === "number" ? mark.mark_type : null,
            text:
                cleanText(mark.content) ??
                cleanText(mark.title) ??
                cleanText(mark.expanded_content) ??
                cleanText(mark.mark_content),
        });
    }
    return [...byTime.values()].sort((a, b) => a.timestampMs - b.timestampMs);
}

/** Read marks back from the jsonb column, tolerating anything unexpected. */
export function readStoredMarks(value: unknown): RecordingMark[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
        const mark = entry as Partial<RecordingMark> | null;
        return mark && Number.isFinite(mark.timestampMs)
            ? [
                  {
                      timestampMs: Number(mark.timestampMs),
                      type: mark.type ?? null,
                      text: mark.text ?? null,
                  },
              ]
            : [];
    });
}
