# 穹顶回响地图编辑器

面向同工作区 `platform_dome` 的浏览器地图编辑器。编辑器使用原生
HTML、JavaScript ES Modules 和 Phaser.js，不需要打包；本地服务使用
`fast-xml-parser` 解析 Tiled JSON 引用的外部 TSX。

## 职责
只负责产出符合 contract 的数据，不实现任何运行时逻辑。
需要新的运行时能力 → 在 contract 里声明，不准在此塞 dome 的代码。
共享协议位于 `platform_contract/`，当前关卡 schema 版本为 `3`。

## 扩展性
新增可编辑对象类型走 registry 注册，禁止在 switch/if 链里加分支。
注册项同时声明放置工厂、默认尺寸、渲染方法、属性面板构建器和稳定 ID 前缀。

## 性能
大场景用增量序列化，禁止每次变更全量 dump。

## 启动

在工作区根目录执行：

```powershell
pnpm --filter platform-dome-map-editor start
```

也可以在本项目目录执行：

```powershell
npm start
```

打开：

```text
http://127.0.0.1:8090
```

编辑器服务默认读取和写入同工作区中的：

```text
../platform_dome/data/levels
```

如果游戏项目位于其他位置，可以在启动前设置 `PLATFORM_DOME_PATH`。

## 当前能力

- 读取游戏现有的 `level-001.json`、`level-002.json`，并依据 `manifest.json` 发现新增关卡。
- 编辑世界尺寸、背景色、镜头参数，以及一个或多个命名出生点。
- 绘制和拖动地形。
- 放置角色、NPC、道具和机关实例。
- 使用统一的“机关”工具放置开关、闸门、入口和出口。
- 入口保存全局 `targetExitId`；角色中点接触入口边缘时传送。可先筛选地图，再选择该地图中的出口。
- 出口是被动传送目标，不主动触发，不保存关卡或通关条件。
- 出生点不占用左侧放置工具，统一在关卡设置中维护，并保存稳定 ID 供后续条件传送引用。
- 在右侧属性面板中精确修改中心坐标、尺寸、颜色及玩法引用。
- 地图对象层级列表、网格吸附、缩放、平移和视图定位。
- 撤销、重做、对象复制、键盘微调和实时数据校验。
- 保存时先校验引用，再原子写入游戏关卡目录，并自动备份旧版本。
- 保存后同步维护 `data/levels/manifest.json`，游戏刷新后即可读取新增地图。
- 另外提供 JSON 导入和导出，便于迁移或版本管理。
- 顶部“素材库”按“地图 → 背景 / 动画”管理工作区图片素材，支持点击选择、批量上传和拖拽上传。
- 动画区支持横向 PNG 精灵表，自动按图片高度计算方形帧尺寸与横向帧数，并在卡片和查看器中播放。
- 动画素材右键菜单第一项为“帧速”，使用左侧实时动画预览和右侧控制栏调节 1–60 FPS；调整立即生效，点击“确认”后持久化。
- 右键素材卡片可“查看”或“删除”。查看支持滚轮缩放、拖动平移和双击复位。
- 地图画布和素材预览的缩放统一使用邻近采样，放大时保持像素硬边缘。
- 地图滚轮缩放以鼠标所在位置为中心，连续缩放时鼠标下的世界坐标保持不动。
- 关卡设置可从素材库导入单图背景或 Tiled 背景地图；两者统一保存到 `world.background`，导入时会把资源同步到游戏项目。
- Tiled 地图通过文件夹导入，地图文件为 `.json` 或 `.tmj`；文件夹内可同时包含外部 `.tsx` 和 tileset 图片。
- 文件夹中存在多个 Tiled 地图时会显示候选列表，可一次选择导入一个或多个地图；素材名称直接使用对应 JSON/TMJ 文件名。
- 与素材库现有 Tiled 地图重名时会询问是否覆盖；确认后原子替换原素材并保留素材 ID，不再自动追加序号。
- Tiled 背景使用 Phaser 原生 Tilemap 渲染，与单图一样随世界尺寸铺满；碰撞按世界比例变换，并以浅绿色只读覆盖层显示。
- Tiled 碰撞来自碰撞对象层、tileset Collision Editor 和瓦片 `collides` 属性；单向平台属性映射到现有 `platform` 碰撞。
- Tiled `tiles[].animation` 会保留到运行时，并在编辑器和游戏内按帧时长播放；同名 tileset 会按 `firstGid` 自动生成唯一名称。
- 所有对象都可拖四角等比缩放、拖四边单轴缩放；导入素材与角色类型不再限制缩放方向。
- 选中对象后，上方显示左右微调箭头，右侧显示上下微调箭头，每次点击固定移动 1 像素。
- 选择工具下点击地图背景即可选中地图，并显示边界手柄；可通过四角和四边调整世界尺寸。
- 地形分为“地面”和“平台”：地面四周碰撞；平台只在角色从上方落下时提供支撑，可从下方跳穿，按下方向键时下落穿越。

## 素材库

素材原始副本保存在编辑器当前工作区；作为关卡背景导入时，选中的
图片或 Tiled 地图素材组会复制到游戏目录并写入关卡引用。

```text
platform_editor/assets/map/backgrounds
platform_editor/assets/map/entities
platform_editor/assets/map/tiled
```

支持 `PNG`、`JPG`、`WebP`、`GIF` 和 `SVG`，单个文件最大 20 MB。重名文件会自动追加序号，不会覆盖已有素材。

横向 PNG 精灵表规则：

- 帧高等于图片高度；
- 帧宽取图片高度，按方形帧切分；
- 帧数为图片宽度除以图片高度后向下取整；
- 默认帧速为 8 FPS，可在动画素材右键菜单中调整；
- 帧速保存在素材文件旁的 `.meta.json` 元数据文件中。

## 跨项目表现协议

- 当前关卡 `schemaVersion = 3`；旧背景字段由 contract 的迁移函数统一升级。
- 图片背景：`world.background = { type: "image", id, path, fileName, fit, revision }`。
- Tiled 背景：`world.background = { type: "tiled", ... }`，保存源 JSON/TMJ、运行时 Tiled JSON、tileset 和地图局部碰撞矩形。
- `id` 指向编辑器素材库中的背景；`path` 是游戏项目内可读取的资源路径。
- 角色实例使用 `scaleX`、`scaleY` 表示水平与垂直缩放；旧 `scale` 仍可作为兼容输入。
- 道具实例可使用 `width`、`height` 覆盖配置中的默认尺寸。
- 地形实例使用 `terrainType`：`ground` 为实体地面，`platform` 为单向平台。
- 编辑器和游戏分别通过表现字段解析模块解释同一套数据，避免玩法代码直接依赖编辑器实现。

## 保存规则

- “保存到游戏”会把当前关卡写入 `platform_dome/data/levels/<关卡 id>.json`。
- 写入前使用 contract 统一校验并补充当前 `schemaVersion`。
- 已有文件会先复制到本工程的 `.editor-backups/`，再写入新内容。
- 新增关卡会登记进 `platform_dome/data/levels/manifest.json`。
- 游戏启动时会读取该清单并加载其中列出的全部关卡。
- 保存失败时不会覆盖原文件；数据校验错误也会阻止保存。

## 关卡结构

- `spawnPoints`：命名出生点列表。
- `initialSpawnId`：新游戏或直接进入关卡时使用的出生点。
- `mechanisms`：统一保存特殊对象，通过 `type` 区分 `switch`、`gate`、`entrance`、`exit` 和后续类型。
- `story` 与 `quest` 不再写入关卡 JSON，后续由独立任务/剧情系统管理。

## 快捷键

| 按键 | 功能 |
| --- | --- |
| `V` | 选择；拖动对象移动，拖动空白区域平移地图 |
| 中键拖动 | 平移地图 |
| `R` | 地形 |
| `A` / `I` | 角色 / 道具 |
| `M` | 机关、闸门、入口或出口 |
| `D` / `Delete` | 删除工具 / 删除选中对象 |
| 滚轮 | 以指针为中心缩放 |
| 方向键 | 按网格微调；`Shift` 为 10 像素 |
| `Ctrl+Z` / `Ctrl+Y` | 撤销 / 重做 |
| `Ctrl+D` | 复制选中对象 |
| `Ctrl+S` | 保存到游戏 |
| `0` | 适应窗口 |

## 校验

```powershell
npm test
npm run check
```

`npm run check` 会检查 JavaScript 语法、关卡 JSON、角色与道具引用、闸门与机关引用、入口绑定出口以及关卡清单完整性。
