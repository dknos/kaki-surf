const GLYPHS = {
  " ": "000000000000000",
  A: "010101111101101",
  B: "110101110101110",
  C: "011100100100011",
  D: "110101101101110",
  E: "111100110100111",
  F: "111100110100100",
  G: "011100101101011",
  H: "101101111101101",
  I: "111010010010111",
  J: "001001001101010",
  K: "101101110101101",
  L: "100100100100111",
  M: "101111111101101",
  N: "101111111111101",
  O: "010101101101010",
  P: "110101110100100",
  Q: "010101101111011",
  R: "110101110101101",
  S: "011100010001110",
  T: "111010010010010",
  U: "101101101101111",
  V: "101101101101010",
  W: "101101111111101",
  X: "101101010101101",
  Y: "101101010010010",
  Z: "111001010100111",
  0: "111101101101111",
  1: "010110010010111",
  2: "110001111100111",
  3: "110001111001110",
  4: "101101111001001",
  5: "111100110001110",
  6: "011100110101010",
  7: "111001010010010",
  8: "010101010101010",
  9: "010101011001110",
  ".": "000000000000010",
  ",": "000000000010100",
  ":": "000010000010000",
  "!": "010010010000010",
  "?": "110001010000010",
  "+": "000010111010000",
  "-": "000000111000000",
  "/": "001001010100100",
  "'": "010010000000000",
  "%": "101001010100101",
  "#": "101111101111101",
  "(": "001010010010001",
  ")": "100010010010100",
};

export function measurePixelText(text, scale = 1, spacing = 1) {
  const count = String(text).length;
  return count ? count * (3 * scale + spacing) - spacing : 0;
}

export function drawPixelText(ctx, text, x, y, {
  scale = 1,
  spacing = scale,
  color = "#fff",
  shadow = null,
  align = "left",
  alpha = 1,
} = {}) {
  const normalized = String(text).toUpperCase();
  const width = measurePixelText(normalized, scale, spacing);
  let cursor = Math.round(x);
  if (align === "center") cursor -= Math.floor(width / 2);
  if (align === "right") cursor -= width;
  const top = Math.round(y);
  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = previousAlpha * alpha;

  if (shadow) drawRun(ctx, normalized, cursor + scale, top + scale, scale, spacing, shadow);
  drawRun(ctx, normalized, cursor, top, scale, spacing, color);
  ctx.globalAlpha = previousAlpha;
  return width;
}

function drawRun(ctx, text, x, y, scale, spacing, color) {
  ctx.fillStyle = color;
  let cursor = x;
  for (const character of text) {
    const glyph = GLYPHS[character] ?? GLYPHS["?"];
    for (let index = 0; index < 15; index += 1) {
      if (glyph[index] !== "1") continue;
      const column = index % 3;
      const row = Math.floor(index / 3);
      ctx.fillRect(cursor + column * scale, y + row * scale, scale, scale);
    }
    cursor += 3 * scale + spacing;
  }
}
