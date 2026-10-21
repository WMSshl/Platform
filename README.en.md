# Echoes Under the Dome

[简体中文](README.md)

> A data-driven side-scrolling action game prototype, level editor, and shared data contract.

Echoes Under the Dome is a browser-based action game platform built around three independent packages: a level editor, a Phaser.js game runtime, and a shared contract that defines every cross-project data structure.

The current goal is a playable vertical slice rather than a complete commercial release. Levels can be created in the editor, validated against the contract, saved into the game data directory, and loaded directly by the runtime.

## Highlights

- **Single source of truth:** Level schemas, validation, migrations, and cross-level reference checks live in `platform_contract`.
- **Visual level editor:** Edit terrain, spawn points, actors, items, mechanisms, image backgrounds, and Tiled map backgrounds.
- **Asset management:** Organize assets with categories, nested folders, drag-and-drop, copy, cut, paste, rename, and conflict resolution.
- **Playable action prototype:** Includes movement, jumping, sprinting, three-stage melee attacks, guarding, guard counters, enemy AI, pickups, and mechanism puzzles.
- **Complete level flow:** Entrance-to-exit transitions, manifest-driven loading, manual saves, and a result screen.
- **Unified background pipeline:** Image and Tiled backgrounds share the same `world.background` model, including collisions and animated tiles.

## Architecture

```text
platform_editor  ──produces──▶  platform_contract  ◀──consumes──  platform_dome
   level editor                    shared contract                     game runtime
```

The dependency direction is always `editor → contract ← dome`. The editor and runtime never import each other's source code; cross-project data is exchanged only through JSON structures defined by the contract.

| Package | Package name | Responsibility |
| --- | --- | --- |
| `platform_contract` | `contract` | Schemas, validation, migrations, Tiled backgrounds, and collision geometry |
| `platform_editor` | `platform-dome-map-editor` | Browser editor, asset library, and level persistence |
| `platform_dome` | `platform-dome` | Phaser.js runtime, gameplay systems, and save data |

### Data flow

1. The editor reads existing content from `platform_dome/data/levels`.
2. Edited levels are validated against the contract and normalized to the current `schemaVersion`.
3. Levels are written atomically to the game directory and registered in `manifest.json`.
4. The game reads the manifest and performs migrations, validation, and asset preparation during loading.
5. Gameplay systems consume normalized data without re-parsing the contract on hot paths.

## Quick start

Install the workspace dependencies with pnpm:

```powershell
corepack enable
pnpm install
```

Start the level editor:

```powershell
pnpm --filter platform-dome-map-editor start
```

Open `http://127.0.0.1:8090`.

Start the game:

```powershell
pnpm --filter platform-dome start
```

Open `http://127.0.0.1:8081`.

The editor reads and writes the sibling `platform_dome/data/levels` directory. Every save is validated against the contract, and existing levels are backed up before replacement.

## Validation

```powershell
pnpm check
pnpm test
```

Packages can also be validated independently:

```powershell
pnpm --filter contract check
pnpm --filter contract test
pnpm --filter platform-dome-map-editor check
pnpm --filter platform-dome-map-editor test
pnpm --filter platform-dome check
pnpm --filter platform-dome test
```

## Current status

Implemented:

- Contract schema v3 with migrations from v1 and v2.
- Image and Tiled backgrounds, tileset animations, and collision extraction.
- Browser level editing, asset organization, and level persistence.
- Two playable levels with combat, talents, mechanisms, transitions, and manual saves.
- Automated tests and static checks for the contract, editor, and runtime.

Planned or incomplete:

- A full story graph, quest progression, and NPC dialogue system.
- Dedicated editor modules for actors, quests, NPCs, and monsters.
- Multi-slot save UI, final character art, and audio.
- Browser end-to-end tests and a larger set of production levels.

## Documentation

- [Data contract](platform_contract/README.md)
- [Level editor](platform_editor/README.md)
- [Game runtime](platform_dome/README.md)
- [Runtime architecture](platform_dome/docs/01-项目架构.md)
- [Requirements](platform_dome/docs/02-需求清单.md)
- [Level data format](platform_dome/docs/05-关卡数据格式.md)

## Development principles

- Declare all cross-project fields in the contract first.
- Increment the schema version and provide a migration whenever persisted structures change.
- Keep the editor and runtime dependent on the contract rather than on each other's implementation.
- Register new editor object types through the editor registry and new gameplay systems through the runtime system registry.
