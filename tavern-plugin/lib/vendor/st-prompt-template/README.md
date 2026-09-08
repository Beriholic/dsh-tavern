# ST-Prompt-Template upstream baseline

Pinned upstream: https://github.com/zonde306/ST-Prompt-Template/tree/d6f520d149aba146305b0b781ddd691d449c28d2

Manifest version: 1.17.9 (upstream package.json separately reports 1.17).
License: upstream AGPL-3.0; see upstream/LICENSE. Preserve attribution and corresponding source when distributing a derived build.

`upstream/` contains every upstream tracked source/configuration/documentation/test/library file, byte-for-byte. Only the generated `dist/` directory is excluded; it contains the SillyTavern-targeted bundle, source maps, and editor assets, not DSH host adapters. The complete source includes all five entry modules: handler, command, UI, exports, code editor. This directory is NOT yet loaded by DSH.

`upstream-lock.json` records the immutable commit and SHA-256 of every retained file. Host changes belong outside upstream/; a future build should resolve imports through explicit adapters rather than hand-edit upstream sources.

Run from repository root:

```
node tavern-plugin/lib/vendor/st-prompt-template/host-build/audit.mjs
```

Requires the project's Node 22 runtime with stripTypeScriptTypes support. The audit checks inventory and content hashes before parsing TypeScript without executing it. It lists static imports, including imports that upstream did not explicitly label as types. The inventory is deliberately not a compatibility score: globals, dynamic loading, DOM selectors, event ordering, and persistence behavior require separate runtime tests. `runtimeReady` remains false.

See docs/implementation/st-prompt-template-full-port.md for integration and acceptance boundaries.
