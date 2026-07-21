/**
 * Persistent playfield UI contract. Temporary teaching and set callouts are
 * intentionally not listed here: the water and rider motion do the teaching.
 */
export function persistentHudContract(simulation = {}) {
  if (simulation.coreSurfLab) {
    return Object.freeze({
      coreLab: true,
      telemetry: simulation.coreSurfLabTelemetry !== false,
      fields: Object.freeze([]),
    });
  }
  const fields = ["score", simulation.mode?.timed === false ? "paws" : "time"];
  fields.push("turbo");
  const multiplier = Number(simulation.currentMultiplier?.() ?? 1);
  const player = simulation.player ?? {};
  const combo = multiplier > 1.15 && (
    Number(simulation.score?.comboHeat) > 0.08
    || player.state === "airborne"
    || Boolean(player.tubeRide?.active)
  );
  if (combo) fields.push("combo");
  return Object.freeze({ coreLab: false, telemetry: false, fields: Object.freeze(fields) });
}
