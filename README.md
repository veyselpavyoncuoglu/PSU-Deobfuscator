# PSU Deobfuscator

Static devirtualizer for PSU-obfuscated Lua. It recovers the packed VM chunk, classifies VM handlers, expands superinstructions, rebuilds Lua 5.1 bytecode, and cleans the decompiler output into readable Lua.

The default source cleanup renames decompiler temporaries to deterministic `v1`, `v2`, `v3`, ... names and folds common decompiler artifacts such as repeated table/member chains and method-call setup.

## Requirements

- Node.js 18 or newer
- Java only when producing source through unluac
- `unluac.jar` for source decompilation

Install dependencies:

```bash
npm install
```

Place unluac at `tools/unluac.jar`, set `UNLUAC_JAR`, or pass `--unluac <path>`.

## Usage

```bash
npm run deobf -- script.lua
```

The default output is `script.deobf.lua`.

```bash
npm run deobf -- script.lua -o recovered.lua
npm run deobf -- script.lua --bytecode recovered.luac
npm run deobf -- script.lua --check
npm run deobf -- script.lua --raw
npm run deobf -- script.lua --json
```

`--check` performs parsing, payload recovery, VM decoding, handler recovery, superinstruction expansion, and Lua 5.1 lowering without invoking unluac. It is useful for compatibility testing and does not require Java.

`--raw` keeps unluac's original temporary names and formatting. Normal output applies the readable cleanup pass.

## Tests

```bash
npm test
npm run test:samples
```

`npm test` runs the fast semantic and source-cleanup tests. `npm run test:samples` checks the bundled corpus and reports known unsupported or malformed fixtures separately from regressions.

## Layout

```text
src/core/        wrapper analysis, payload and VM decoding
src/ir/          semantic recovery and Lua 5.1 lowering
src/bytecode/    Lua 5.1 chunk writer
src/decompile/   unluac integration
src/emit/        source cleanup
src/cli.js       command-line interface
test/            fast regression tests
samples/         compatibility corpus
```

## Notes

The decoder intentionally rejects layouts it cannot validate instead of emitting guessed bytecode. PSU variants can differ in wrapper shape, handler composition, and operand layout, so unsupported samples should be treated as decoder work rather than forced through lossy fallbacks.

Only inspect code you are authorized to analyze.
