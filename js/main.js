import { createKakiSurf } from "./integration-adapter.js";

const host = document.querySelector("#kaki-surf-root");

try {
  const qaScene = new URLSearchParams(location.search).get("qa");
  const game = await createKakiSurf({ host, qaScene });
  game.start();
  globalThis.kakiSurf = game;
} catch (error) {
  console.error("Kaki Surf failed to launch.", error);
  host.innerHTML = `
    <section class="launch-error" role="alert">
      <p>THE WAVE MISSED THE BEACH</p>
      <h1>KAKI SURF COULD NOT START</h1>
      <button type="button">TRY AGAIN</button>
    </section>
  `;
  host.querySelector("button")?.addEventListener("click", () => location.reload());
}
