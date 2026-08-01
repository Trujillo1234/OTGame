import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set(
    "test",
    `${process.pid}-${Date.now()}-${pathname}`,
  );
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the two-title Emmy and Opie arcade", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Emmy &amp; Opie Arcade<\/title>/i);
  assert.match(html, /Pick a title card and jump straight into the action\./);
  assert.match(html, /href="\/penn-run"/);
  assert.match(html, /href="\/denver-fight-club"/);
  assert.match(html, /Penn Run/);
  assert.match(html, /Denver Fight Club/);
  assert.match(html, /og\.png\?v=20260731-3/);
  assert.doesNotMatch(html, /codex-preview|Building your site/);
});

test("serves both complete game routes", async () => {
  const [raceResponse, fightResponse] = await Promise.all([
    render("/penn-run"),
    render("/denver-fight-club"),
  ]);
  assert.equal(raceResponse.status, 200);
  assert.equal(fightResponse.status, 200);

  const [raceHtml, fightHtml] = await Promise.all([
    raceResponse.text(),
    fightResponse.text(),
  ]);
  assert.match(raceHtml, /Penn Run/);
  assert.match(raceHtml, /THE TINY DENVER GRAND PRIX/);
  assert.match(raceHtml, /BOOST/);
  assert.match(raceHtml, /GAME SELECT/);
  assert.match(fightHtml, /Denver Fight Club/);
  assert.match(fightHtml, /CHOOSE THE LOCATION/);
  assert.match(fightHtml, /GAME SELECT/);
});

test("keeps the race models and Denver fight arenas in the release", async () => {
  const requiredAssets = [
    "../public/models/little-car-color.glb",
    "../public/models/opie-walking.glb",
    "../public/models/cap-hill/penelopes-tiny-denver-race.3mf",
    "../public/models/capitol/colorado-state-capitol-base.stl",
    "../public/models/capitol/colorado-state-capitol-dome.stl",
    "../public/models/art-museum/denver-art-museum.stl",
    "../public/models/art-museum/LICENSE.txt",
    "../public/models/cathedral/denver-cathedral.stl",
    "../public/models/cathedral/SOURCE.txt",
    "../public/images/trader-joes-storefront.webp",
    "../public/games/otgame/backgrounds/colorado-state-capitol.webp",
    "../public/games/otgame/backgrounds/sixteenth-street.webp",
    "../public/games/otgame/backgrounds/colfax-avenue.webp",
    "../public/games/otgame/backgrounds/governors-park.webp",
  ];
  await Promise.all(
    requiredAssets.map((asset) => access(new URL(asset, import.meta.url))),
  );

  const raceSource = await readFile(
    new URL("../app/PennRunGame.tsx", import.meta.url),
    "utf8",
  );
  const raceStyles = await readFile(
    new URL("../app/PennRunGame.css", import.meta.url),
    "utf8",
  );
  const hubStyles = await readFile(
    new URL("../app/game-hub.css", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(raceSource, /createOpieHarness|WALKING HARNESS/);
  assert.match(raceSource, /opie-body-and-head/);
  assert.match(raceSource, /colorado-state-capitol-base\.stl/);
  assert.match(raceSource, /colorado-state-capitol-dome\.stl/);
  assert.match(raceSource, /denver-art-museum\.stl/);
  assert.match(raceSource, /denver-cathedral\.stl/);
  assert.match(raceSource, /DENVER CATHEDRAL/);
  assert.match(raceSource, /CC BY-SA 3\.0/);
  assert.match(raceSource, /leftLeg\.rotation\.z/);
  assert.match(raceSource, /b: "boost"/);
  assert.match(raceSource, /driftVelocity/);
  assert.match(raceSource, /touchProps\("boost"\)/);
  assert.match(raceSource, /input\.forward \|\| input\.boost/);
  assert.match(raceSource, /trader-joes-storefront\.webp/);
  assert.match(raceSource, /addTraderJoes\(/);
  assert.match(raceSource, /isCapitolOpenSpace/);
  assert.match(raceSource, /isArtMuseumOpenSpace/);
  assert.match(raceSource, /isCivicViewCorridor/);
  assert.match(raceSource, /isDriving && character === "emmy"/);
  assert.match(raceStyles, /character-option\[data-selected="true"\]::after/);
  assert.match(raceStyles, /character-option:focus-visible/);
  assert.match(raceStyles, /overflow-y: auto/);
  assert.match(raceStyles, /touch-action: pan-y/);
  assert.match(hubStyles, /body:has\(\.game-hub\)/);
  assert.match(hubStyles, /overflow-y: auto/);
});
