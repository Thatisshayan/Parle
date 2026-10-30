/**
 * Splits chat text into lines so each line can take its own reading direction (dir="auto").
 * One dir="auto" on a whole message lets its first character decide for every line, so a reply that opens in
 * Persian or Arabic flips its French lines right to left and moves their punctuation. Empty lines stay as a
 * no-break space so the gap between paragraphs keeps its height.
 */
export function textLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n").map((line) => (line.length ? line : " "));
}
