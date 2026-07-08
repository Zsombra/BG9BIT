/**
 * Minimal JSONC support: strip `//` line comments and block comments,
 * plus trailing commas, so config files can be human-annotated.
 * String literals are preserved (comment markers inside strings are ignored).
 */
export function stripJsonc(input: string): string {
  let out = "";
  let inString = false;
  let stringQuote = "";
  let inLine = false;
  let inBlock = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    const next = i + 1 < input.length ? input[i + 1]! : "";

    if (inLine) {
      if (ch === "\n") {
        inLine = false;
        out += ch;
      }
      continue;
    }
    if (inBlock) {
      if (ch === "*" && next === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === "\\") {
        // keep the escaped char verbatim
        out += next;
        i++;
      } else if (ch === stringQuote) {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringQuote = ch;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      inLine = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlock = true;
      i++;
      continue;
    }
    out += ch;
  }

  // remove trailing commas before } or ]
  return out.replace(/,(\s*[}\]])/g, "$1");
}

export function parseJsonc<T = unknown>(text: string): T {
  return JSON.parse(stripJsonc(text)) as T;
}
