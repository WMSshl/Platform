# 穹顶回响 Platform

[English](README.en.md)

> 数据驱动的横版动作游戏原型、关卡编辑器与共享数据契约。

“穹顶回响”是一个运行在浏览器中的横版剧情动作游戏项目。本仓库将地图编辑、游戏运行时和跨项目数据协议拆分为三个独立包，通过 contract-first 架构连接内容生产与游戏消费。

当前目标不是直接交付完整商业游戏，而是建立一个可编辑、可运行、可验证的游戏垂直切片：关卡可以在编辑器中制作，经统一校验后保存到游戏目录，并由 Phaser.js 运行时直接加载。

## 核心能力

- **统一数据契约**：关卡 schema、校验规则、版本迁移和跨关卡引用检查集中在 `platform_contract`。
- **可视化关卡编辑**：支持地形、出生点、角色、道具、机关、图片背景与 Tiled 地图背景编辑。
- **素材管理**：支持分类、嵌套文件夹、拖拽归档、复制、剪切、粘贴、重命名和重名冲突处理。
- **可玩动作原型**：包含移动、跳跃、冲刺、三段近战、防御、格挡反击、敌人 AI、拾取和机关解谜。
- **完整关卡流程**：支持入口与出口驱动的跨关卡传送、关卡清单加载、手动存档和通关结算。
- **双向背景管线**：图片和 Tiled 地图使用统一的 `world.background` 结构，并支持碰撞与动画瓦片。

## 项目架构

```text
platform_editor  ──产出──▶  platform_contract  ◀──消费──  platform_dome
    地图编辑器                  唯一数据协议                    游戏运行时
```

依赖方向固定为 `editor → contract ← dome`。编辑器和游戏运行时不得互相导入源码，跨项目数据只通过 contract 定义的 JSON 结构传递。

| 包 | 包名 | 职责 |
| --- | --- | --- |
| `platform_contract` | `contract` | schema、校验、迁移、Tiled 背景与碰撞计算 |
| `platform_editor` | `platform-dome-map-editor` | 浏览器地图编辑器、素材库和关卡保存服务 |
| `platform_dome` | `platform-dome` | Phaser.js 游戏运行时、玩法和存档 |

### 数据流

1. 编辑器读取 `platform_dome/data/levels` 中的现有内容。
2. 编辑结果通过 contract 校验并补齐当前 `schemaVersion`。
3. 关卡以原子方式写入游戏目录，同时更新 `manifest.json`。
4. 游戏启动时读取关卡清单，在加载阶段完成迁移、校验和资源准备。
5. 运行时只消费规范化后的数据，不在玩法热路径中重复解析 contract。

## 快速开始

项目使用 pnpm workspace 管理三个包：

```powershell
corepack enable
pnpm install
```

启动地图编辑器：

```powershell
pnpm --filter platform-dome-map-editor start
```

默认访问 `http://127.0.0.1:8090`。

启动游戏：

```powershell
pnpm --filter platform-dome start
```

默认访问 `http://127.0.0.1:8081`。

编辑器会直接读写同工作区的 `platform_dome/data/levels`。保存前会执行 contract 校验，旧关卡会自动备份。

## 验证

```powershell
pnpm check
pnpm test
```

也可以分别验证各项目：

```powershell
pnpm --filter contract check
pnpm --filter contract test
pnpm --filter platform-dome-map-editor check
pnpm --filter platform-dome-map-editor test
pnpm --filter platform-dome check
pnpm --filter platform-dome test
```

## 当前状态

已完成的内容包括：

- contract schema v3，以及 v1、v2 到当前版本的迁移。
- 图片与 Tiled 背景、tileset 动画和背景碰撞处理。
- 浏览器关卡编辑器、素材库和关卡保存闭环。
- 两关卡可玩流程、战斗、天赋、机关、传送和手动存档。
- contract、编辑器和运行时的自动化测试与静态检查。

仍待完善的内容包括：

- 完整剧情节点、任务推进和 NPC 对话系统。
- 编辑器中的角色、任务、NPC 和怪物配置模块。
- 多存档位界面、正式角色美术和音频系统。
- 浏览器端端到端测试和更多正式关卡内容。

## 文档

- [数据契约](platform_contract/README.md)
- [地图编辑器](platform_editor/README.md)
- [游戏运行时](platform_dome/README.md)
- [运行时架构](platform_dome/docs/01-项目架构.md)
- [需求清单](platform_dome/docs/02-需求清单.md)
- [关卡数据格式](platform_dome/docs/05-关卡数据格式.md)

## 开发约定

- 跨项目字段必须先在 contract 中声明。
- 持久化结构变化必须提升 schema 版本并提供迁移。
- 编辑器与运行时只能依赖 contract，不得复制对方的私有实现。
- 编辑器新增对象类型应通过 registry 注册，运行时新增玩法应通过 system registry 注册。

