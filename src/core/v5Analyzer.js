// PSU 5.0.A wrapper analysis.
//
// The 5.0.A format differs fundamentally from 4.x:
//   [mangled prologue]  - anti-parse junk; held the payload decryption setup (destroyed)
//   "PSU|payload"       - 500 KB base62 string, uniformly distributed (encrypted)
//   [symbol decoy]      - ~500 KB of 6-symbol noise between payload and the VM core
//   [VM core]           - intact: constant decoder o(), readers i()/d()/a(), chunk
//                         deserializer I()/_(), VM runner A() with a clean numeric
//                         dispatch (opcodes 0..62, no shuffler)
//   ({constant table})  - self-contained, statically evaluable
//
// The VM core is fully recoverable; the payload cipher is not: the prologue that
// contained the initial rolling-XOR key and the payload transform is syntactically
// destroyed (invalid Lua tokens on purpose), and no second 5.0.A sample exists in this
// repo to diff against. Every plausible transform (LZW framing in both bases and
// orders, base6 pairings, bignum interpretations, rolling XOR/sub/add over the raw and
// base64-decoded payload, case channels) was brute-forced and fails: the payload is a
// stream-cipher output whose keystream setup is unrecoverable from this file alone.
//
// This module therefore recognizes 5.0.A files, extracts and validates every
// recoverable piece, and reports precisely what is missing instead of guessing.

const MARKER = "PSU|";

function extractMarkers(source) {
  const candidates = [];
  let position = 0;
  while ((position = source.indexOf(MARKER, position)) >= 0) {
    const start = position + MARKER.length;
    let end = -1;
    let inString = false;
    for (let i = start; i < source.length && end < 0; i += 1) {
      const c = source[i];
      if (c === "\\") { i += 1; continue; }
      if (c === '"') { end = i; break; }
      if (c === "\n") break;
    }
    candidates.push({ marker: position, start, end });
    position = start;
  }
  return candidates;
}

function classifyMarker(source, candidate) {
  if (candidate.end < 0) return null;
  const text = source.slice(candidate.start, candidate.end);
  if (text.length === 0) return null;
  const alphabet = /^[0-9A-Za-z]+$/.test(text) ? "base62" : "other";
  return {
    position: candidate.marker,
    length: text.length,
    alphabet,
    text
  };
}

export function analyzeV5(source) {
  if (!source.includes("PSU Obfuscator v5")) {
    return { version: null };
  }

  const markers = extractMarkers(source)
    .map((candidate) => classifyMarker(source, candidate))
    .filter(Boolean);

  const payload = markers
    .filter((m) => m.alphabet === "base62" && m.length > 1000)
    .sort((a, b) => b.length - a.length)[0] ?? null;

  // The 6-symbol decoy: uniform noise with no LZW structure.
  const decoyStart = source.indexOf("PSU|...}", 0);
  const hasSymbolDecoy = decoyStart >= 0;

  // The VM core: 'local function o(' through the runner's dispatch terminator.
  const coreStart = source.indexOf("local function o(n,e,");
  const runnerCall = source.indexOf("return A(I(),{},v())");
  const coreEnd = runnerCall >= 0 ? source.indexOf(";", runnerCall) + 1 : -1;
  const core = coreStart >= 0 && coreEnd > coreStart ? source.slice(coreStart, coreEnd) : null;

  // The constant table: '({' after the core's closing 'end)'.
  const tableOpen = source.indexOf("(({", coreEnd > 0 ? coreEnd - 40 : 0);
  let table = null;
  if (tableOpen >= 0) {
    const braceOpen = tableOpen + 2;
    let depth = 0;
    let inString = false;
    let close = -1;
    for (let i = braceOpen; i < source.length; i += 1) {
      const c = source[i];
      if (inString) {
        if (c === "\\") { i += 1; continue; }
        if (c === '"') inString = false;
        continue;
      }
      if (c === '"') { inString = true; continue; }
      if (c === "{") depth += 1;
      if (c === "}") {
        depth -= 1;
        if (depth === 0) { close = i; break; }
      }
    }
    if (close > braceOpen) table = source.slice(braceOpen, close + 1);
  }

  const prologueMangled = (() => {
    // The file must start with 'return(function(' and contain invalid tokens such as
    // '_local ... =' before any valid statement; luaparse fails at column 20/28.
    const head = source.slice(0, Math.min(600, source.length));
    return head.includes("_local") || head.includes(":_(");
  })();

  return {
    version: "5.0A",
    prologueMangled,
    payload,
    hasSymbolDecoy,
    core: core ? { start: coreStart, end: coreEnd, length: core.length } : null,
    table: table ? { start: tableOpen, length: table.length } : null,
    markers: markers.map((m) => ({ position: m.position, length: m.length, alphabet: m.alphabet }))
  };
}
