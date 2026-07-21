import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { GAME_VERSION, LOGICAL_HEIGHT, LOGICAL_WIDTH } from "../js/config.js";
import { GENERATED_ASSET_MANIFEST } from "../js/asset-manifest.js";
import { createKakiSurf } from "../js/integration-adapter.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_PATH = path.join(ROOT, "index.html");
const QA_PATH = path.join(ROOT, "qa.html");

test("index uses relative stylesheet and module entry URLs that exist", () => {
  const tags = parseHtml(read(INDEX_PATH));
  const stylesheets = tags.filter((tag) => tag.name === "link" && relTokens(tag).has("stylesheet"));
  const modules = tags.filter((tag) => tag.name === "script" && tag.attributes.type?.toLowerCase() === "module");

  assert.ok(stylesheets.length > 0, "index.html should link at least one stylesheet");
  assert.ok(modules.length > 0, "index.html should load at least one native module entry");

  for (const tag of stylesheets) assertLocalFileReference(INDEX_PATH, tag.attributes.href, "stylesheet");
  for (const tag of modules) assertLocalFileReference(INDEX_PATH, tag.attributes.src, "module entry");
  assertAllPageAssetsExist(INDEX_PATH, tags);
});

test("every native module import resolves to a local source file", () => {
  const entries = [
    ...moduleEntries(INDEX_PATH),
    ...moduleEntries(QA_PATH),
  ];
  const graph = buildModuleGraph(entries);

  assert.ok(graph.has(path.join(ROOT, "js", "main.js")), "the playable entry should be in the graph");
  assert.ok(graph.has(path.join(ROOT, "js", "qa-gallery.js")), "the QA entry should be in the graph");

  for (const [file, module] of graph) {
    for (const imported of module.imports) {
      assert.equal(typeof imported.specifier, "string", `${relative(file)} has a non-literal dynamic import`);
      assert.match(imported.specifier, /^\.\.?\//, `${relative(file)} must use a relative native-module import`);
      const resolved = resolveLocalReference(file, imported.specifier);
      assert.ok(isFile(resolved), `${relative(file)} imports missing ${imported.specifier}`);
    }
  }
});

test("runtime entries contain no remote asset or API URLs", () => {
  const pagePaths = [INDEX_PATH, QA_PATH];
  const entries = pagePaths.flatMap(moduleEntries);
  const graph = buildModuleGraph(entries);

  for (const pagePath of pagePaths) {
    for (const reference of htmlReferences(parseHtml(read(pagePath)))) {
      assert.equal(isRemoteReference(reference.value), false, `${relative(pagePath)} references ${reference.value}`);
    }
  }

  for (const [file, module] of graph) {
    const remoteLiterals = module.tokens
      .filter((token) => token.type === "string" || token.type === "template")
      .map((token) => token.value.match(/https?:\/\/[^\s'"`<>]+/i)?.[0])
      .filter(Boolean);
    assert.deepEqual(remoteLiterals, [], `${relative(file)} contains remote runtime URLs`);
  }

  for (const stylesheet of stylesheetEntries(pagePaths)) {
    for (const reference of cssReferences(read(stylesheet))) {
      assert.equal(isRemoteReference(reference), false, `${relative(stylesheet)} references ${reference}`);
      if (!isEmbeddedReference(reference)) assertLocalFileReference(stylesheet, reference, "CSS asset");
    }
  }
});

test("the rendered game canvas remains a fixed 384 by 216 logical playfield", () => {
  assert.deepEqual([LOGICAL_WIDTH, LOGICAL_HEIGHT], [384, 216]);

  const gameSource = read(path.join(ROOT, "js", "game.js"));
  const canvasTags = parseHtml(gameSource).filter((tag) => tag.name === "canvas");
  assert.ok(canvasTags.length > 0, "game markup should include a canvas");

  for (const canvas of canvasTags) {
    assert.equal(resolveDimension(canvas.attributes.width), 384, "canvas logical width");
    assert.equal(resolveDimension(canvas.attributes.height), 216, "canvas logical height");
  }
});

test("browser entry points do not depend on bundler or generated build output", () => {
  const pagePaths = [INDEX_PATH, QA_PATH];
  const entryAssets = pagePaths.flatMap((pagePath) =>
    htmlReferences(parseHtml(read(pagePath)))
      .filter((reference) => !isEmbeddedReference(reference.value))
      .map((reference) => resolveLocalReference(pagePath, reference.value)),
  );
  const graph = buildModuleGraph(pagePaths.flatMap(moduleEntries));
  const forbiddenOutput = /(^|[\\/])(?:dist|build|out|\.parcel-cache|\.vite|node_modules)(?:[\\/]|$)|(?:^|[.-])(?:bundle|chunk)(?:[.-]|$)/i;

  for (const file of [...entryAssets, ...graph.keys()]) {
    assert.doesNotMatch(relative(file), forbiddenOutput, `${relative(file)} looks like generated build output`);
  }

  const packageJson = JSON.parse(read(path.join(ROOT, "package.json")));
  assert.equal(packageJson.type, "module", "the static host should execute source files as native modules");
});

test("the main menu exposes the package version as a quiet build stamp", () => {
  const packageJson = JSON.parse(read(path.join(ROOT, "package.json")));
  const gameSource = read(path.join(ROOT, "js", "game.js"));

  assert.equal(GAME_VERSION, packageJson.version);
  assert.match(gameSource, /class="build-version"/);
  assert.match(gameSource, /class="build-version"[^>]*>v\$\{GAME_VERSION\}<\/span>/);
});

test("integration adapter preserves the lifecycle surface and local dynamic import", () => {
  const adapterPath = path.join(ROOT, "js", "integration-adapter.js");
  const source = read(adapterPath);
  const imports = extractModuleSpecifiers(tokenizeJavaScript(source));
  const dynamicImports = imports.filter((imported) => imported.kind === "dynamic");
  const lifecycle = ["start", "pause", "resume", "restart", "destroy", "getSnapshot"];

  assert.equal(typeof createKakiSurf, "function");
  assert.deepEqual(dynamicImports, [{ kind: "dynamic", specifier: "./game.js" }]);
  assert.deepEqual(extractFrozenReturnKeys(source).sort(), lifecycle.sort());
});

test("QA page references only present local files", () => {
  const tags = parseHtml(read(QA_PATH));
  const references = htmlReferences(tags);

  assert.ok(references.length > 0, "qa.html should declare its stylesheet and module entry");
  for (const reference of references) {
    assert.equal(isRemoteReference(reference.value), false, `qa.html references ${reference.value}`);
    if (!isEmbeddedReference(reference.value)) {
      assertLocalFileReference(QA_PATH, reference.value, `${reference.tag} ${reference.attribute}`);
    }
  }

  assertAllPageAssetsExist(QA_PATH, tags);
});

test("every generated production atlas is local, dimension-checked, and compact", () => {
  const requiredFamilies = [
    "twilightHeroWave",
    "waveBreaker", "waveProgression",
    "dolphin", "shark", "whale", "birds", "boats", "airTraffic", "powerups", "boards", "carrier",
    "uiOrnaments",
  ];
  assert.deepEqual(Object.keys(GENERATED_ASSET_MANIFEST), requiredFamilies);

  for (const [family, descriptor] of Object.entries(GENERATED_ASSET_MANIFEST)) {
    const file = path.join(ROOT, "assets", "generated", descriptor.filename);
    assert.ok(isFile(file), `${family} atlas should be checked in locally`);
    const bytes = readFileSync(file);
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${family} should be a PNG`);
    assert.equal(bytes.readUInt32BE(16), descriptor.width, `${family} manifest width`);
    assert.equal(bytes.readUInt32BE(20), descriptor.height, `${family} manifest height`);
    assert.ok(bytes.byteLength < 512 * 1024, `${family} stays within the compact runtime budget`);
    const minimumFrames = family === "waveProgression" || family === "twilightHeroWave"
      ? 4
      : 8;
    assert.ok(Object.keys(descriptor.frames).length >= minimumFrames, `${family} publishes reusable frame metadata`);
  }
});

test("condition aerial panoramas are tall local masters with unique art direction", () => {
  const hashes = new Set();
  for (const conditionId of ["goldenCoast", "twilightGlass", "stormbreak"]) {
    const file = path.join(ROOT, "assets", "backgrounds", `${conditionId}-aerial.png`);
    assert.ok(isFile(file), `${conditionId} aerial panorama should be checked in locally`);
    const bytes = readFileSync(file);
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(bytes.readUInt32BE(16), 1536, `${conditionId} panorama width`);
    assert.equal(bytes.readUInt32BE(20), 640, `${conditionId} panorama height`);
    assert.ok(bytes.byteLength < 512 * 1024, `${conditionId} panorama stays compact for Pages`);
    hashes.add(createHash("sha256").update(bytes).digest("hex"));
  }
  assert.equal(hashes.size, 3, "each condition keeps a distinct vertical world");

  const continuityCheck = spawnSync(
    "python3",
    ["tools/art/build-aerial-panoramas.py", "--check"],
    { cwd: ROOT, encoding: "utf8" },
  );
  assert.equal(
    continuityCheck.status,
    0,
    `aerial panorama continuity check failed:\n${continuityCheck.stdout}${continuityCheck.stderr}`,
  );

  const loaderSource = read(path.join(ROOT, "js", "asset-loader.js"));
  assert.match(loaderSource, /`\$\{conditionId\}-aerial\.png`/);
  assert.match(loaderSource, /BACKGROUND_WIDTH = 1536/);
  assert.match(loaderSource, /BACKGROUND_HEIGHT = 640/);
});

function read(file) {
  return readFileSync(file, "utf8");
}

function relative(file) {
  return path.relative(ROOT, file).replaceAll(path.sep, "/");
}

function isFile(file) {
  return existsSync(file) && statSync(file).isFile();
}

function parseHtml(source) {
  const tags = [];
  const tagPattern = /<!--[^]*?-->|<([a-z][\w:-]*)\b([^>]*)>/gi;

  for (const match of source.matchAll(tagPattern)) {
    if (!match[1]) continue;
    tags.push({
      name: match[1].toLowerCase(),
      attributes: parseAttributes(match[2]),
    });
  }
  return tags;
}

function parseAttributes(source) {
  const attributes = {};
  const attributePattern = /([:@\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (const match of source.matchAll(attributePattern)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}

function relTokens(tag) {
  return new Set((tag.attributes.rel ?? "").toLowerCase().split(/\s+/).filter(Boolean));
}

function htmlReferences(tags) {
  const references = [];
  for (const tag of tags) {
    for (const attribute of ["src", "href", "poster"]) {
      const value = tag.attributes[attribute];
      if (value) references.push({ tag: tag.name, attribute, value });
    }
  }
  return references;
}

function moduleEntries(pagePath) {
  return parseHtml(read(pagePath))
    .filter((tag) => tag.name === "script" && tag.attributes.type?.toLowerCase() === "module")
    .map((tag) => {
      assertLocalFileReference(pagePath, tag.attributes.src, "module entry");
      return resolveLocalReference(pagePath, tag.attributes.src);
    });
}

function stylesheetEntries(pagePaths) {
  return pagePaths.flatMap((pagePath) =>
    parseHtml(read(pagePath))
      .filter((tag) => tag.name === "link" && relTokens(tag).has("stylesheet"))
      .map((tag) => resolveLocalReference(pagePath, tag.attributes.href)),
  );
}

function assertAllPageAssetsExist(pagePath, tags) {
  for (const reference of htmlReferences(tags)) {
    if (isEmbeddedReference(reference.value)) continue;
    assertLocalFileReference(pagePath, reference.value, `${reference.tag} ${reference.attribute}`);
  }
}

function assertLocalFileReference(owner, reference, label) {
  assert.equal(typeof reference, "string", `${relative(owner)} ${label} is missing a URL`);
  assert.notEqual(reference, "", `${relative(owner)} ${label} is missing a URL`);
  assert.equal(isRemoteReference(reference), false, `${relative(owner)} ${label} must be local: ${reference}`);
  assert.equal(reference.startsWith("/"), false, `${relative(owner)} ${label} must be relative: ${reference}`);
  const resolved = resolveLocalReference(owner, reference);
  assert.ok(isFile(resolved), `${relative(owner)} ${label} is missing: ${reference}`);
}

function isRemoteReference(reference) {
  return /^[a-z][a-z\d+.-]*:/i.test(reference) || reference.startsWith("//");
}

function isEmbeddedReference(reference) {
  return reference.startsWith("#") || /^(?:data|blob):/i.test(reference);
}

function resolveLocalReference(owner, reference) {
  const pathname = reference.split(/[?#]/, 1)[0].replaceAll("/", path.sep);
  const resolved = path.resolve(path.dirname(owner), pathname);
  const fromRoot = path.relative(ROOT, resolved);
  assert.ok(fromRoot === "" || (!fromRoot.startsWith("..") && !path.isAbsolute(fromRoot)), `${reference} escapes the project root`);
  return resolved;
}

function buildModuleGraph(entries) {
  const graph = new Map();
  const queue = [...new Set(entries.map((entry) => path.resolve(entry)))];

  while (queue.length > 0) {
    const file = queue.shift();
    if (graph.has(file)) continue;
    assert.ok(isFile(file), `module entry is missing: ${relative(file)}`);

    const source = read(file);
    const tokens = tokenizeJavaScript(source);
    const imports = extractModuleSpecifiers(tokens);
    graph.set(file, { imports, source, tokens });

    for (const imported of imports) {
      assert.equal(typeof imported.specifier, "string", `${relative(file)} has a non-literal dynamic import`);
      assert.equal(isRemoteReference(imported.specifier), false, `${relative(file)} imports remote ${imported.specifier}`);
      assert.match(imported.specifier, /^\.\.?\//, `${relative(file)} has a bare module import: ${imported.specifier}`);
      const resolved = resolveLocalReference(file, imported.specifier);
      assert.ok(isFile(resolved), `${relative(file)} imports missing ${imported.specifier}`);
      queue.push(resolved);
    }
  }

  return graph;
}

function extractModuleSpecifiers(tokens) {
  const imports = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== "identifier" || (token.value !== "import" && token.value !== "export")) continue;

    const next = tokens[index + 1];
    if (token.value === "import" && next?.value === ".") continue;
    if (token.value === "import" && next?.value === "(") {
      imports.push({
        kind: "dynamic",
        specifier: tokens[index + 2]?.type === "string" ? tokens[index + 2].value : null,
      });
      continue;
    }
    if (token.value === "import" && next?.type === "string") {
      imports.push({ kind: "static", specifier: next.value });
      continue;
    }

    for (let cursor = index + 1; cursor < tokens.length && tokens[cursor].value !== ";"; cursor += 1) {
      if (tokens[cursor].type === "identifier" && tokens[cursor].value === "from") {
        const specifier = tokens[cursor + 1];
        if (specifier?.type === "string") imports.push({ kind: "static", specifier: specifier.value });
        break;
      }
    }
  }

  return imports;
}

function tokenizeJavaScript(source) {
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const character = source[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === "/" && source[index + 1] === "/") {
      index = source.indexOf("\n", index + 2);
      if (index === -1) break;
      continue;
    }
    if (character === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    if (character === '"' || character === "'") {
      const parsed = readQuotedToken(source, index, character);
      tokens.push({ type: "string", value: parsed.value });
      index = parsed.next;
      continue;
    }
    if (character === "`") {
      const parsed = readQuotedToken(source, index, character);
      tokens.push({ type: "template", value: parsed.value });
      index = parsed.next;
      continue;
    }
    if (/[A-Za-z_$]/.test(character)) {
      let end = index + 1;
      while (end < source.length && /[\w$]/.test(source[end])) end += 1;
      tokens.push({ type: "identifier", value: source.slice(index, end) });
      index = end;
      continue;
    }

    tokens.push({ type: "punctuator", value: character });
    index += 1;
  }

  return tokens;
}

function readQuotedToken(source, start, quote) {
  let value = "";
  let index = start + 1;

  while (index < source.length) {
    if (source[index] === "\\") {
      value += source[index + 1] ?? "";
      index += 2;
      continue;
    }
    if (source[index] === quote) return { value, next: index + 1 };
    value += source[index];
    index += 1;
  }

  return { value, next: source.length };
}

function cssReferences(source) {
  const references = new Set();
  const urlPattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)'";]+))\s*\)/gi;
  const importPattern = /@import\s+(?:"([^"]+)"|'([^']+)')/gi;
  for (const match of source.matchAll(urlPattern)) references.add(match[1] ?? match[2] ?? match[3]);
  for (const match of source.matchAll(importPattern)) references.add(match[1] ?? match[2]);
  return [...references];
}

function resolveDimension(value) {
  if (/^\d+$/.test(value ?? "")) return Number(value);
  const constant = value?.match(/^\$\{([A-Z_]+)\}$/)?.[1];
  return { LOGICAL_WIDTH, LOGICAL_HEIGHT }[constant];
}

function extractFrozenReturnKeys(source) {
  const tokens = tokenizeJavaScript(source);
  const start = tokens.findIndex((token, index) =>
    token.value === "return"
      && tokens[index + 1]?.value === "Object"
      && tokens[index + 2]?.value === "."
      && tokens[index + 3]?.value === "freeze"
      && tokens[index + 4]?.value === "("
      && tokens[index + 5]?.value === "{",
  );
  assert.notEqual(start, -1, "adapter should return its frozen public surface");

  const keys = [];
  let braces = 0;
  let parentheses = 0;
  let brackets = 0;
  let expectingKey = true;

  for (let index = start + 5; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.value === "{") {
      braces += 1;
      continue;
    }
    if (token.value === "}") {
      braces -= 1;
      if (braces === 0) break;
      continue;
    }
    if (token.value === "(") parentheses += 1;
    if (token.value === ")") parentheses -= 1;
    if (token.value === "[") brackets += 1;
    if (token.value === "]") brackets -= 1;

    const atTopLevel = braces === 1 && parentheses === 0 && brackets === 0;
    if (atTopLevel && expectingKey && (token.type === "identifier" || token.type === "string")) {
      if (tokens[index + 1]?.value === ":" || tokens[index + 1]?.value === "(") keys.push(token.value);
      expectingKey = false;
    }
    if (atTopLevel && token.value === ",") expectingKey = true;
  }

  return keys;
}
