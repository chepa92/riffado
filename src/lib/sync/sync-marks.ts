import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { recordings } from "@/db/schema";
import type { createPlaudClient } from "@/lib/plaud/client-factory";
import { findInlineContent } from "@/lib/plaud/content";
import {
    parseMarks,
    type RecordingMark,
    selectMarkItem,
} from "@/lib/plaud/marks";

type PlaudClient = Awaited<ReturnType<typeof createPlaudClient>>;

// Each recording costs one Plaud request, so catch up gradually.
const BATCH_SIZE = 25;

/**
 * Fetch one recording's highlight marks from Plaud and store them. Throws if
 * Plaud could not give us the file detail, so a failed lookup is retried on the
 * next sync instead of being recorded as "no marks".
 */
export async function refreshRecordingMarks(
    recording: { id: string; plaudFileId: string },
    plaudClient: PlaudClient,
): Promise<RecordingMark[]> {
    const detail = await plaudClient.getFileDetail(recording.plaudFileId);
    if (detail.status !== 0 || !detail.data) {
        throw new Error(detail.msg ?? "Plaud returned no file detail");
    }

    const item = selectMarkItem(detail);
    let raw = item ? findInlineContent(detail, item.data_id) : undefined;
    if (raw === undefined && item?.data_link) {
        raw = await plaudClient.fetchContentLink(item.data_link);
    }

    const marks = parseMarks(raw);
    const now = new Date();
    await db
        .update(recordings)
        .set({ marks, marksSyncedAt: now, updatedAt: now })
        .where(eq(recordings.id, recording.id));
    return marks;
}

/**
 * Pull marks for recordings that don't have them yet (newest first, a batch
 * per sync). Never throws: marks are a nicety and must not break syncing.
 */
export async function syncRecordingMarks(
    userId: string,
    plaudClient: PlaudClient,
): Promise<number> {
    let synced = 0;
    try {
        const pending = await db
            .select({
                id: recordings.id,
                plaudFileId: recordings.plaudFileId,
            })
            .from(recordings)
            .where(
                and(
                    eq(recordings.userId, userId),
                    isNull(recordings.deletedAt),
                    isNull(recordings.marksSyncedAt),
                ),
            )
            .orderBy(desc(recordings.startTime))
            .limit(BATCH_SIZE);

        let consecutiveFailures = 0;
        for (const recording of pending) {
            try {
                await refreshRecordingMarks(recording, plaudClient);
                synced++;
                consecutiveFailures = 0;
            } catch (error) {
                console.warn(
                    `[marks] could not fetch marks for ${recording.id}:`,
                    error instanceof Error ? error.message : error,
                );
                // A dead token or an outage fails everything; stop early.
                if (++consecutiveFailures >= 3) break;
            }
        }
    } catch (error) {
        console.error("[marks] sync failed:", error);
    }
    return synced;
}
