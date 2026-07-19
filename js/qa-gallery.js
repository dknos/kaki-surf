const SCENES = [
  ["menu", "Updated menu - three boards", "wide"],
  ["results", "Results breakdown", "wide"],
  ["neutral", "Neutral riding"],
  ["powerLine", "Power-line momentum charge", "", "perfect"],
  ["maxSpeed", "Seam-earned max speed", "", "perfect"],
  ["pumpCompression", "Pump compression"],
  ["pumpRelease", "Pump release", "", "perfect"],
  ["snap", "Snap / slash"],
  ["cutback", "Cutback / layback"],
  ["floater", "Floater / re-entry"],
  ["tubeTuck", "Tube tuck / soul arch", "", "danger"],
  ["launch", "Lip launch"],
  ["frontRail", "Front Rail Grab"],
  ["tailGrab", "Tail Grab"],
  ["varial", "Board Varial"],
  ["kakiTwist", "Kaki Twist", "", "perfect"],
  ["combo360", "360 Tail Grab + Varial"],
  ["combo540", "Perfect 540 Varial", "", "perfect"],
  ["perfectLanding", "Perfect landing", "", "perfect"],
  ["wobble", "Wobble recovery", "", "danger"],
  ["wipeout", "Affectionate wipeout", "", "danger"],
  ["touch", "Touch trick diamond", "wide", "access"],
  ["highContrast", "High-contrast presentation", "", "access"],
  ["goldenCoast", "Condition - Golden Coast"],
  ["twilightGlass", "Condition - Twilight Glass"],
  ["stormbreak", "Condition - Stormbreak", "", "danger"],
];

const grid = document.querySelector("#qa-grid");
const fragment = document.createDocumentFragment();

for (const [scene, label, size = "", tone = ""] of SCENES) {
  const figure = document.createElement("figure");
  figure.dataset.scene = scene;
  if (size) figure.className = size;
  if (tone) figure.dataset.tone = tone;

  const caption = document.createElement("figcaption");
  caption.textContent = label;

  const shot = document.createElement("img");
  shot.className = "qa-shot";
  shot.loading = "eager";
  shot.decoding = "sync";
  shot.alt = `${label} QA capture`;
  shot.src = `./docs/images/qa/${encodeURIComponent(scene)}.png`;

  figure.append(caption, shot);
  fragment.append(figure);
}

grid.append(fragment);
