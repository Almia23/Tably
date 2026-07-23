import { customAlphabet } from "nanoid";

// Excludes visually ambiguous characters (0/O, 1/I/L) so codes are easy to
// read aloud/type at a table, per project-plan.md's `splitsmart.app/join/7K2N` example.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const generate = customAlphabet(ALPHABET, 4);

export function generateTableCode(): string {
  return generate();
}
