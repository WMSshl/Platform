# 穹顶回响 Platform

[English](README.en.md)

> 数据驱动的横版动作游戏原型、关卡与内容编辑器，以及共享数据契约。

“穹顶回响”是一个运行在浏览器中的横版剧情动作游戏项目。本仓库将地图编辑、内容编辑、游戏运行时和跨项目数据协议拆分为三个独立包，通过 contract-first 架构连接内容生产与游戏消费。

当前目标不是直接交付完整商业游戏，而是建立一个可编辑、可运行、可验证的游戏垂直切片：关卡和角色内容可以在编辑器中制作，经统一校验后保存到游戏目录，并由 Phaser.js 运行时直接加载。

## 核心能力

- **统一数据契约**：关卡 schema 为 `5`，独立内容文档 schema 为 `16`；校验、版本迁移、跨关卡引用检查和公共几何计算集中在 `platform_contract`。
- **可视化关卡编辑**：支持地形、出生点、角色、道具、机关、图片背景与 Tiled 地图背景编辑。
- **内容编辑工作区**：提供会话、任务、物品、动画演绎与角色五类内容，使用 `00`–`04` 稳定 ID 前缀，支持通用嵌套目录和素材库中的动画、贴图与音频引用。
- **角色与帧设置**：角色支持 16 项数值属性、唯一共享碰撞体、动画绑定、动画备注、左右分开的键鼠触发键、按帧保存的多边形攻击范围、帧音效和死亡动画。
- **素材与音频管理**：支持分类、嵌套文件夹、拖拽归档、复制、剪切、粘贴、重命名和重名冲突处理；音频分为短音效与环境音，支持试听、进度拖动和音量控制。
- **可玩动作原型**：包含移动、跳跃、冲刺、三段近战、防御、格挡反击、敌人 AI、拾取和机关解谜。
- **完整关卡流程**：支持入口与出口驱动的跨关卡传送、关卡清单加载、手动存档和通关结算。
- **双向背景管线**：图片和 Tiled 地图使用统一的 `world.background` 结构，并支持碰撞与动画瓦片。

## 项目架构

```text
platform_editor  ──产出──▶  platform_contract  ◀──消费──  platform_dome
    地图与内容编辑器              唯一数据协议                    游戏运行时
```

依赖方向固定为 `editor → contract ← dome`。编辑器和游戏运行时不得互相导入源码，跨项目数据只通过 contract 定义的 JSON 结构传递。

| 包 | 包名 | 职责 |
| --- | --- | --- |
| `platform_contract` | `contract` | schema、校验、迁移、Tiled 背景、碰撞计算与内容结构 |
| `platform_editor` | `platform-dome-map-editor` | 浏览器地图与内容编辑器、素材库和保存服务 |
| `platform_dome` | `platform-dome` | Phaser.js 游戏运行时、玩法和存档 |

### 数据流

1. 编辑器读取 `platform_dome/data/levels` 和 `platform_dome/data/content` 中的现有内容。
2. 编辑结果通过 contract 校验并补齐当前 `schemaVersion`。
3. 关卡与内容以原子方式写入游戏目录，关卡同时更新 `manifest.json`。
4. 游戏启动时读取关卡清单，在加载阶段完成迁移、校验和资源准备。
5. 运行时只消费规范化后的数据，不在玩法热路径中重复解析 contract。

## 内容编辑

- **会话**：多轮对话表、角色与正文编辑、拖拽排序、折叠编辑、嵌套目录和最近 10 项快捷列表。
- **任务**：前置任务、状态条件、物品数量完成条件和完成奖励。
- **物品**：一级/二级类型、稀有度、堆叠上限、买卖价格、交易开关、特殊效果和素材库插图。
- **动画演绎**：独立内容条目与目录管理，供关卡和角色配置引用。
- **角色**：生命值上限、防御力、攻击力、无敌帧、移动与跳跃等 16 项属性；角色拥有唯一碰撞体，所有动画帧共享同一归一化矩形，随帧尺寸等比缩放。
- **角色动画**：从素材库绑定水平精灵表，支持帧速、右向/左向镜像预览、死亡动画、动画备注、左右分开的键盘与鼠标触发键。
- **帧设置**：每个动画帧可独立保存 `3–12` 个顶点的多边形攻击范围，相邻点可切换直线或曲线；攻击范围只对当前帧生效，不会沿用到其它帧。帧音效从“音效 / 短音效”导入，可设置音量与循环。
- **音频**：素材库音频卡片提供三角试听按钮；关卡设置可从“环境音”导入背景音乐，保存文件夹、路径、音量与循环设置，默认循环。
- 内容保存到 `platform_dome/data/content/content.json`；旧文档会自动迁移到当前 schema。背景音乐播放、碰撞体和攻击范围在游戏运行时的消费仍待后续适配。

## 快速开始

项目使用 pnpm workspace 管理三个包：

```powershell
corepack enable
pnpm install
```

启动地图与内容编辑器：

```powershell
pnpm --filter platform-dome-map-editor start
```

默认访问 `http://127.0.0.1:8090`；端口被占用时开发服务器会自动选择后续端口。

启动游戏：

```powershell
pnpm --filter platform-dome start
```

默认访问 `http://127.0.0.1:8081`。

编辑器会直接读写同工作区的 `platform_dome/data/levels` 和 `platform_dome/data/content`。保存前会执行 contract 校验，旧关卡会自动备份。

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

- 关卡 schema `5`，支持 v1–v4 迁移；独立内容 schema `16`，支持 V1–V15 迁移。
- 图片与 Tiled 背景、tileset 动画、背景碰撞提取与公共碰撞计算。
- 浏览器关卡编辑器、素材库、内容工作区和关卡保存闭环。
- 会话、任务、物品、动画演绎和角色五类内容编辑，以及通用嵌套目录。
- 角色属性、共享碰撞体、动画绑定、动画备注、触发键、按帧攻击范围、帧音效和死亡动画。
- 短音效、环境音、动画帧音效和关卡背景音乐导入；背景音乐支持音量与循环设置。
- 两关卡可玩流程、战斗、天赋、机关、传送和手动存档。
- contract、编辑器和运行时的自动化测试与静态检查。

仍待完善的内容包括：

- 剧情节点、任务推进和 NPC 对话系统。
- 游戏运行时对角色碰撞体、按帧攻击范围、动画备注和背景音乐的消费。
- 多存档位界面、正式角色美术和完整音频系统。
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
