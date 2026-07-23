/**
 * Normalizes a food item's display name to Title Case (each word
 * capitalized, e.g. "garlic bread" -> "Garlic Bread") so item names look
 * consistent regardless of whether they came from the LLM receipt parser or
 * were typed in manually. Applied server-side wherever an item name is
 * written, so it's authoritative no matter the entry path.
 */
export function toTitleCase(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => (word.length === 0 ? word : word[0].toUpperCase() + word.slice(1).toLowerCase()))
    .join(" ");
}
