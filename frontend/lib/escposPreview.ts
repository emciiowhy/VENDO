/**
 * Render an ESC/POS byte stream back to readable plain text — a paper proof for
 * the thermal receipt when no printer is on hand. It interprets exactly the
 * command subset {@link lib/escpos} emits (init, align, bold, double-size, feed,
 * cut, drawer-kick, and printable text), applies the alignment padding at the
 * given column width, and annotates the control ops so layout bugs (a 58mm
 * ticket squeezed onto an 80mm proof, a mis-padded total row) are visible at a
 * glance. Pure and DOM-free, so it runs anywhere — a dev page, a test, a log.
 */

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

type Align = "left" | "center" | "right";

function pad(text: string, align: Align, width: number): string {
  if (text.length >= width) return text;
  const slack = width - text.length;
  if (align === "center") return " ".repeat(Math.floor(slack / 2)) + text;
  if (align === "right") return " ".repeat(slack) + text;
  return text;
}

/**
 * Decode `bytes` to the lines a printer would emit at `width` columns. Mirrors
 * the serialiser's command set; unknown escape sequences are skipped rather than
 * printed as garbage.
 */
export function decodeEscPos(bytes: Uint8Array, width = 32): string {
  const lines: string[] = [];
  let align: Align = "left";
  let buffer = "";

  const flush = () => {
    lines.push(pad(buffer, align, width));
    buffer = "";
  };

  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];

    if (b === ESC) {
      const op = bytes[i + 1];
      if (op === 0x40) {
        // ESC @ — init
        align = "left";
        i += 2;
      } else if (op === 0x61) {
        // ESC a n — align
        const n = bytes[i + 2];
        align = n === 1 ? "center" : n === 2 ? "right" : "left";
        i += 3;
      } else if (op === 0x45) {
        // ESC E n — bold (style only; ignored in a text proof)
        i += 3;
      } else if (op === 0x64) {
        // ESC d n — feed n lines
        const n = bytes[i + 2];
        flush();
        for (let f = 0; f < n; f++) lines.push("");
        i += 3;
      } else if (op === 0x70) {
        // ESC p — cash drawer kick
        if (buffer) flush();
        lines.push("          [cash drawer kick]");
        i += 5;
      } else {
        i += 2;
      }
    } else if (b === GS) {
      const op = bytes[i + 1];
      if (op === 0x21) {
        // GS ! n — double size (style only)
        i += 3;
      } else if (op === 0x56) {
        // GS V m [n] — cut
        if (buffer) flush();
        lines.push("- - - - - - - ✂ CUT - - - - - - -");
        i += 4;
      } else {
        i += 2;
      }
    } else if (b === LF) {
      flush();
      i += 1;
    } else {
      buffer += String.fromCharCode(b);
      i += 1;
    }
  }
  if (buffer) flush();
  return lines.join("\n");
}
