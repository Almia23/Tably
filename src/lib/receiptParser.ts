import OpenAI from "openai";
import { z } from "zod";

const ParsedItemSchema = z.object({
  name: z.string(),
  price: z.number(),
  quantity: z.number().int().positive().default(1),
  lowConfidence: z.boolean().default(false),
});

export const ParsedReceiptSchema = z.object({
  items: z.array(ParsedItemSchema),
  taxAmount: z.number().default(0),
  tipAmount: z.number().default(0),
  confidence: z.number().min(0).max(1).default(1),
});

export type ParsedReceipt = z.infer<typeof ParsedReceiptSchema>;

const SYSTEM_PROMPT = `You are a receipt-parsing assistant for a bill-splitting app.
Given a photo of a restaurant receipt, extract structured data as JSON matching this shape:
{
  "items": [{ "name": string, "price": number, "quantity": number, "lowConfidence": boolean }],
  "taxAmount": number,
  "tipAmount": number,
  "confidence": number // 0-1, your overall confidence in this parse
}
Rules:
- "price" is the price per single unit (not the line total).
- Mark "lowConfidence": true on any item whose name, price, or quantity you are unsure about
  (faded print, merged line items, handwriting, ambiguous shared dishes, etc).
- Do not include tax/tip as line items; put them in taxAmount/tipAmount instead.
- If you cannot read the receipt at all, return an empty items array and confidence: 0.
- Respond with ONLY the JSON object, no markdown fences, no commentary.`;

function isConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return Boolean(key && !key.includes("replace-me"));
}

/**
 * Parses a receipt image via an OpenAI vision-capable model into structured
 * item/tax/tip data (project-plan.md §2 feature 1, §3).
 *
 * Returns `null` when no real API key is configured or the call/parse fails —
 * callers MUST fall back to the manual entry form (project-plan.md §6:
 * "never block the user").
 */
export async function parseReceiptImage(
  imageDataUrl: string,
): Promise<ParsedReceipt | null> {
  if (!isConfigured()) return null;

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_VISION_MODEL || "gpt-4o";

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Parse this receipt." },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = ParsedReceiptSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;

    return parsed.data;
  } catch (err) {
    console.error("[parseReceiptImage] failed, falling back to manual entry:", err);
    return null;
  }
}
