#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
base_url="${KAKI_SURF_QA_URL:-http://127.0.0.1:9876/index.html}"
capture_dir="$project_root/docs/images/qa"
debug_port="${KAKI_SURF_CDP_PORT:-9225}"
browser_profile="$(mktemp -d /tmp/kaki-gallery-cdp.XXXXXX)"

scenes=(
  menu results settingsSimple settingsAdvanced simpleKeyboard simpleGamepad neutral leftTravel rightTravel reversal
  downhill curlEarly curlFolding curlImpact curlDanger
  heroGather-twilightGlass heroPitch-twilightGlass heroOpen-twilightGlass
  heroDeep-twilightGlass heroMax-twilightGlass heroCollapse-twilightGlass
  heroTube-twilightGlass heroAir-twilightGlass maxSpeed turboBoost
  pumpCompression pumpRelease powerLine smallAir launch hugeAir clockwiseSpin counterSpin
  frontRail tailGrab varial kakiTwist snap cutback floater tubeTuck combo360 combo540 switchLanding
  perfectLanding wobble wipeout dolphinApproach dolphinRide dolphinDismount
  sharkApproach sharkNearMiss sharkCollision whaleDistant whaleBreach whaleRamp
  whaleRide whaleRideLeft whaleSplash dolphinGates dolphinReduced sharkHighContrast whaleReduced
  ambientBusy ambientReverse twilightTraffic-twilightGlass stormTraffic-stormbreak
  gullFlock pelican ternFlock cormorantFlock flockScatter featherThread
  pelicanCourier gullCourier bannerPlane bannerBigAir bannerDolphins bannerShark
  propPlane helicopter seaplane sailboat speedboat fishingBoat tugboat cargoShip
  jetSki rescueCraft speedboatRace jetSkiRace mangoRush moonPop starFoam
  powerupMiss planeDrop aircraftDrop mangoExpired moonConsumed starSave carrierHaze
  carrierArrival carrierDeck carrierLaunch fleetAirshow touch touchAdvanced highContrast
  reducedMotion reducedFlash goldenCoast twilightGlass stormbreak foamPuff-goldenCoast foamPuff-twilightGlass
  foamPuff-stormbreak mangoFish-goldenCoast mangoFish-twilightGlass
  mangoFish-stormbreak moonLog-goldenCoast moonLog-twilightGlass moonLog-stormbreak
)

mkdir -p "$capture_dir"
chromium \
  --headless \
  --no-sandbox \
  --disable-gpu \
  --disable-breakpad \
  --disable-crash-reporter \
  --disable-background-networking \
  --hide-scrollbars \
  --remote-debugging-port="$debug_port" \
  --user-data-dir="$browser_profile" \
  about:blank >/tmp/kaki-gallery-chromium.log 2>&1 &
browser_pid=$!
trap 'kill "$browser_pid" 2>/dev/null || true' EXIT

for _attempt in {1..40}; do
  if curl --silent --fail "http://127.0.0.1:$debug_port/json/list" >/dev/null; then
    break
  fi
  sleep 0.1
done

KAKI_SURF_CDP_URL="http://127.0.0.1:$debug_port" \
KAKI_SURF_QA_URL="$base_url" \
KAKI_SURF_QA_DIR="$capture_dir" \
node "$project_root/tools/qa/capture-scenes.mjs" "${scenes[@]}"

cp "$capture_dir/menu.png" "$project_root/docs/images/menu.png"
cp "$capture_dir/maxSpeed.png" "$project_root/docs/images/ride.png"
python3 "$project_root/tools/qa/build-contact-sheet.py"
echo "Captured ${#scenes[@]} deterministic browser QA scenes."
