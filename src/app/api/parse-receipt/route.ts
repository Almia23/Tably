import { NextRequest, NextResponse } from "next/server";
import { parseReceiptImage } from "@/lib/receiptParser";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Parses an uploaded receipt image via the LLM (project-plan.md §2 feature 1).
 * Returns `{ parsed: null, fallback: true }` when no API key is configured or
 * parsing fails — the client must fall back to the manual entry form rather
 * than blocking (project-plan.md §6).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const imageDataUrl = body?.imageDataUrl;

  if (!imageDataUrl || typeof imageDataUrl !== "string") {
    return NextResponse.json(
      { error: "imageDataUrl is required" },
      { status: 400 },
    );
  }

  const parsed = await parseReceiptImage(imageDataUrl);

  if (!parsed) {
    return NextResponse.json({ parsed: null, fallback: true });
  }

  return NextResponse.json({ parsed, fallback: false });
}
