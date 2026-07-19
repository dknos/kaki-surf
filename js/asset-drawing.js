/**
 * Draw one locally packed atlas frame. Generated art is always optional: a
 * missing image or manifest entry returns false so callers can keep their
 * deterministic code-authored fallback.
 */
export function drawAtlasFrame(ctx, assets, familyName, frameName, x, y, options = {}) {
  const image = assets?.generated?.[familyName];
  const frame = assets?.generatedManifest?.[familyName]?.frames?.[frameName];
  if (!image || !frame || typeof ctx?.drawImage !== "function") return false;

  const scale = Number.isFinite(options.scale) ? options.scale : 1;
  const width = frame.width * scale * (Number.isFinite(options.scaleX) ? options.scaleX : 1);
  const height = frame.height * scale * (Number.isFinite(options.scaleY) ? options.scaleY : 1);
  const anchor = frame.anchor ?? [0.5, 0.5];
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (options.rotation) ctx.rotate(options.rotation);
  if (options.flipX) ctx.scale(-1, 1);
  ctx.globalAlpha *= Number.isFinite(options.alpha) ? options.alpha : 1;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    image,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    Math.round(-width * anchor[0]),
    Math.round(-height * anchor[1]),
    Math.round(width),
    Math.round(height),
  );
  ctx.restore();
  return true;
}
