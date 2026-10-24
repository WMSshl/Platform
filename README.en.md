# Echoes Under the Dome

[简体中文](README.md)

> A data-driven side-scrolling action game prototype, level and content editor, and shared data contract.

Echoes Under the Dome is a browser-based action game platform built around three independent packages: an editor, a Phaser.js game runtime, and a shared contract that defines every cross-project data structure.

The current goal is a playable vertical slice rather than a complete commercial release. Levels and character content can be created in the editor, validated against the contract, saved into the game data directory, and loaded directly by the runtime.

## Highlights

- **Single source of truth:** Level schema `5` and content schema `16`, with validation, migrations, cross-level reference checks, and shared geometry in `platform_contract`.
- **Visual level editor:** Edit terrain, spawn points, actors, items, mechanisms, image backgrounds, and Tiled map backgrounds.
- **Content workspaces:** Conversations, quests, items, animation entries, and characters share stable `00`–`04` ID prefixes, nested folders, and asset-library references for animations, textures, and audio.
- **Characters and frame settings:** Sixteen numeric attributes, one shared collision body, animation bindings, animation notes, left/right keyboard and mouse triggers, per-frame polygon attack ranges, frame sounds, and a death animation.
- **Asset and audio management:** Categories, nested folders, drag-and-drop, copy, cut, paste, rename, and conflict resolution; audio is split into short SFX and ambient tracks with preview, seek, and volume controls.
- **Playable action prototype:** Movement, jumping, sprinting, three-stage melee attacks, guarding, guard counters, enemy AI, pickups, and mechanism puzzles.
- **Complete level flow:** Entrance-to-exit transitions, manifest-driven loading, manual saves, and a result screen.
- **Unified background pipeline:** Image and Tiled backgrounds share the same `world.background` model, including collisions and animated tiles.

## Architecture

```text
platform_editor  ──produces──▶  platform_contract  ◀──consumes──  platform_dome
 level & content editor            shared contract                   game runtime
```

The dependency direction is always `editor → contract ← dome`. The editor and runtime never import each other's source code; cross-project data is exchanged only through JSON structures defined by the contract.

| Package | Package name | Responsibility |
| --- | --- | --- |
| `platform_contract` | `contract` | Schemas, validation, migrations, Tiled backgrounds, collision geometry, and content structures |
| `platform_editor` | `platform-dome-map-editor` | Browser level and content editor, asset library, and persistence service |
| `platform_dome` | `platform-dome` | Phaser.js runtime, gameplay systems, and save data |

### Data flow

1. The editor reads existing levels from `platform_dome/data/levels` and content from `platform_dome/data/content`.
2. Edited documents are validated against the contract and normalized to the current `schemaVersion`.
3. Levels and content are written atomically to the game directory; level changes also update `manifest.json`.
4. The game reads the manifest and performs migrations, validation, and asset preparation during loading.
5. Gameplay systems consume normalized data without re-parsing the contract on hot paths.

## Content editing

- **Conversations:** Multi-round dialogue tables with speaker and text editing, drag reordering, collapsible rows, nested folders, and a recent list of up to ten conversations.
- **Quests:** Prerequisite quests, status conditions, item-quantity completion conditions, and rewards.
- **Items:** Primary/secondary types, rarity, stack limits, buy/sell prices, tradeability, special effects, and asset-library illustrations.
- **Animation entries:** Standalone content records with folder management, referenced by level and character configuration.
- **Characters:** Sixteen numeric attributes including max health, defense, attack, invincibility frames, movement, and jumping. Each character has one collision body shared by every animation frame; it uses a normalized rectangle that scales with frame size.
- **Character animations:** Horizontal sprite sheets bound from the asset library, with frame rate, right/left mirrored preview, death animation, animation notes, and separate left/right keyboard and mouse triggers.
- **Frame settings:** Every animation frame can store its own `3–12`-vertex polygon attack range, with line or curve segments between points. A range applies only to its own frame and is never inherited by other frames. Frame sounds come from the “SFX / short SFX” audio category and support volume and looping.
- **Audio:** Audio cards provide triangular preview buttons; level settings can import background music from the “Ambient” category with folder, path, volume, and loop settings. Loop is enabled by default.
- Content is saved to `platform_dome/data/content/content.json`; older documents migrate automatically to the current schema. Runtime consumption of background music, collision bodies, and attack ranges is still pending.

## Quick start

Install the workspace dependencies with pnpm:

```powershell
corepack enable
pnpm install
```

Start the level and content editor:

```powershell
pnpm --filter platform-dome-map-editor start
```

Open `http://127.0.0.1:8090`. If the port is busy, the dev server selects the next available port automatically.

Start the game:

```powershell
pnpm --filter platform-dome start
```

Open `http://127.0.0.1:8081`.

The editor reads and writes the sibling `platform_dome/data/levels` and `platform_dome/data/content` directories. Every save is validated against the contract, and existing levels are backed up before replacement.

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

- Level schema `5` with migrations from v1–v4, and content schema `16` with migrations from V1–V15.
- Image and Tiled backgrounds, tileset animations, collision extraction, and shared collision geometry.
- Browser level editing, asset organization, content workspaces, and level persistence.
- Conversation, quest, item, animation-entry, and character content editing with nested folders.
- Character attributes, shared collision body, animation bindings, animation notes, triggers, per-frame attack ranges, frame sounds, and the death animation.
- Short SFX, ambient audio, animation frame sounds, and level background music, including volume and loop settings.
- Two playable levels with combat, talents, mechanisms, transitions, and manual saves.
- Automated tests and static checks for the contract, editor, and runtime.

Planned or incomplete:

- Story progression, quest advancement, and an NPC dialogue system.
- Runtime consumption of character collision bodies, per-frame attack ranges, animation notes, and background music.
- Multi-slot save UI, final character art, and a complete audio system.
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
