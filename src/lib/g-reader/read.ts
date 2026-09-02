import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getDb, getEnv, getUploadsBucket } from "@/lib/db";
import { createGReading, type GReading } from "@/lib/repos/g-readings";
import type { GUpload } from "@/lib/repos/g-uploads";
import { PROMPT_VERSION, READER_MODEL, RULE_BOOK, readingInstruction } from "./prompt";
import { ReadingSchema } from "./schema";

/**
 * Read one Exhibit G with Claude and record what it saw. Every outcome
 * is a row in g_readings — the reading, or the error that stopped it —
 * so the analytics see the attempts as well as the hits. The rule book
 * (prompt.ts) is the system prompt and is cached across cards; only
 * the card and the performer's name change per call.
 */

/** The API accepts images to 5 MB; a bigger photo is recorded as unread. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode(...view.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * The API key: the Worker's ANTHROPIC_API_KEY if set, else the
 * app_config row of that name — the same two homes as SESSION_SECRET.
 */
async function apiKey(): Promise<string | null> {
  const env = (await getEnv()) as unknown as { ANTHROPIC_API_KEY?: string };
  if (env.ANTHROPIC_API_KEY) return env.ANTHROPIC_API_KEY;
  const db = await getDb();
  const row = await db
    .prepare("SELECT value FROM app_config WHERE key = 'ANTHROPIC_API_KEY'")
    .first<{ value: string }>();
  return row?.value?.trim() || null;
}

export async function readExhibitG(
  upload: Pick<GUpload, "_id" | "userId" | "filename" | "contentType">,
  performerName: string
): Promise<GReading> {
  const started = Date.now();
  const record = (fields: Partial<Parameters<typeof createGReading>[0]>) =>
    createGReading({
      gUploadId: upload._id,
      userId: upload.userId,
      model: READER_MODEL,
      promptVersion: PROMPT_VERSION,
      reading: null,
      durationMs: Date.now() - started,
      ...fields,
    });

  try {
    const key = await apiKey();
    if (!key) return await record({ error: "ANTHROPIC_API_KEY is not configured" });

    const object = await (await getUploadsBucket()).get(upload.filename);
    if (!object) return await record({ error: "The card's file is missing from storage" });
    const bytes = await object.arrayBuffer();
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return await record({
        error: `The photo is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB; the reader takes up to 5 MB`,
      });
    }
    const data = toBase64(bytes);
    const isPdf = upload.contentType === "application/pdf";
    if (!isPdf && !IMAGE_TYPES.has(upload.contentType)) {
      return await record({ error: `Cannot read a ${upload.contentType}` });
    }

    const client = new Anthropic({ apiKey: key, maxRetries: 2 });
    const response = await client.messages.parse({
      model: READER_MODEL,
      max_tokens: 16000,
      // The rule book is the stable prefix; cache it across cards.
      system: [{ type: "text", text: RULE_BOOK, cache_control: { type: "ephemeral" } }],
      output_config: { format: zodOutputFormat(ReadingSchema), effort: "high" },
      messages: [
        {
          role: "user",
          content: [
            isPdf
              ? {
                  type: "document",
                  source: { type: "base64", media_type: "application/pdf", data },
                }
              : {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: upload.contentType as
                      | "image/jpeg"
                      | "image/png"
                      | "image/gif"
                      | "image/webp",
                    data,
                  },
                },
            { type: "text", text: readingInstruction(performerName) },
          ],
        },
      ],
    });

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      servedModel: response.model,
    };
    if (response.stop_reason === "refusal") {
      return await record({
        ...usage,
        error: `Declined: ${response.stop_details?.explanation ?? response.stop_details?.category ?? "no reason given"}`,
      });
    }
    if (!response.parsed_output) {
      return await record({ ...usage, error: "The reading did not parse" });
    }
    return await record({ ...usage, reading: response.parsed_output });
  } catch (e) {
    const message =
      e instanceof Anthropic.APIError
        ? `API ${e.status}: ${e.message}`
        : e instanceof Error
          ? e.message
          : String(e);
    return await record({ error: message });
  }
}
