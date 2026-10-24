# Platform Contract

`contract` 是穹顶回响编辑器与游戏运行时之间的唯一数据协议层。

## 边界

- `platform_editor` 产出符合 contract 的关卡 JSON。
- `platform_dome` 只消费经过 contract 校验的数据。
- contract 不依赖 editor 或 dome，也不包含 UI、Phaser 或文件系统实现。

## 版本

当前关卡 schema 版本为 `5`。

独立内容文档 schema 版本为 `16`。会话、任务、物品、动画演绎和角色
分别使用 `00`、`01`、`02`、`03`、`04` 作为稳定 ID 前缀。

- `schemaVersion` 是可选输入字段；缺失时按旧版数据迁移。
- 迁移后的文档始终写入当前 `schemaVersion`。
- 未来版本只能追加可选字段或通过迁移函数改变旧字段含义。
- 版本 3 使用统一的 `world.background` 判别联合：
  `type: "image"` 表示单图，`type: "tiled"` 表示 Tiled 地图。
- 两类背景都绑定 `world` 尺寸，不保存独立位置或缩放。
- 公共几何函数 `getTiledBackgroundBounds` 与
  `getTiledBackgroundCollisionRects` 统一处理世界拉伸和碰撞合并。
- 版本 4 新增可选顶层 `backgroundMusic`，记录素材 ID、游戏项目内
  路径、文件名、显示名、MIME、文件夹信息和版本。音乐从素材库的
  “环境音”导入；有值时进入关卡循环播放，离开关卡停止。缺少该
  字段或为 `null` 表示无背景音乐。版本 5 为音乐增加 `volume`
  （`0–1`）和 `loop`，`volume` 默认 `1`，`loop` 默认 `true`。
  运行时的播放接入由后续版本完成。

## 独立内容文档

内容文档与关卡文档分开版本管理，当前 `schemaVersion` 为 `16`。

- 模块键为 `conversations`、`quests`、`items`、`animations`、
  `characters`。
- 稳定 ID 前缀依次为 `00`、`01`、`02`、`03`、`04`，格式为
  `NN-0000`。
- 所有模块共享跨模块唯一 ID 空间。
- `idCounters` 保存各模块已发放的最大流水号，删除内容后也不会回退。
- `validateContentDocument` 校验模块、前缀、ID 唯一性和基础字段。
- 五类内容条目均支持可选 `folderId`，根目录使用 `null`。
- 角色条目使用可选 `attributes` 保存 16 项数值属性，缺少时默认全部
  为 0；包含生命值上限、防御力、攻击力、无敌帧等字段。
- 角色条目使用可选 `collisionBody` 保存唯一碰撞体，所有动画帧共享。
  碰撞体使用归一化坐标 `{ x, y, width, height }`，取值范围为
  `0–1`，随帧尺寸等比缩放并保持相对位置。
- 角色条目使用可选 `animationBindings` 保存动画实例。除 `other`
  （其它动画）外，同一角色每种动画类型只能绑定一次；`other` 可重复。
  动画类型包含待机、移动、攻击、受击、死亡、跳跃、格挡、格挡反击、
  冲刺、翻滚、下落和其它动画。
- 每个动画绑定保存资源 ID、文件路径、来源文件夹、帧尺寸、预览
  方向、帧速、攻击帧、按帧保存的攻击范围、帧音效、备注和触发键数组。
  绑定上的 `direction: "left"` 表示预览时水平镜像；`source.folderId` 与
  `source.folderPath` 记录素材库中的文件夹位置。
- 攻击范围使用 `3–12` 个闭合顶点；相邻顶点组成一段，线段类型为
  `line` 或 `curve`。曲线段通过二次贝塞尔控制点调整弧度。攻击范围
  保存在 `attackRanges` 数组中，每项通过 `frame` 指向单个帧，同一帧
  最多一项；攻击范围只对该帧生效，不会被其它帧继承。
- 每个动画绑定可使用可选 `frameSound` 保存攻击帧的短音效：记录
  素材 ID、文件名、显示名、项目相对路径、`folderId`、`folderPath`
  和播放地址，并以 `volume`（`0–1`）和 `loop` 控制音量与循环。
  `loop` 默认 `false`；音效在动画播放到 `attackFrame` 时触发。
  `null` 表示该帧没有音效。
- 每个触发键单独保存 `direction`（`right` 或 `left`），向右与向左
  镜像的触发键分开配置；缺少该字段时沿用所属动画的 `direction`。
  单个动画内不应出现重复的设备与按键组合。
- `contentFolders` 按模块保存扁平化目录记录，目录通过可选
  `parentId` 表达嵌套关系；`folderIdCounters` 按模块保证文件夹 ID
  删除后不会复用。
- `recentConversationIds` 保存最近打开会话，最多 10 项；列表顶部为
  最新手动排序结果，新会话插入顶部时从底部淘汰。
- 会话条目新增可选 `dialogue` 数组，每行包含稳定 `id`、`role` 和
  `content`；数组顺序即对话播放顺序。
- 任务条目使用可选 `prerequisites` 数组保存前置条件。数组为空时
  不限制任务激活；条件包含 `taskId` 与 `status`，同任务 ID 的状态
  为 OR，不同任务 ID 之间为 AND。`status` 取值为 `inactive`、
  `active`、`completed`。
- `completionConditions` 保存完成条件。当前支持
  `type: "item_quantity"`、稳定 `itemId` 和正整数数量，同一任务
  内物品 ID 不可重复，多个条件之间为 AND。
- `rewards` 保存任务完成时获得的物品，物品 ID 同样不可重复。
- `areQuestPrerequisitesMet` 判断前置条件；
  `resolveQuestOnItemAcquired` 封装“进行中任务获得物品后检查并
  转为已完成，同时返回一次奖励”的状态转换。任务激活和运行时接入
  由后续玩法系统负责。
- 物品条目使用可选 `primaryType`、`secondaryType`、`rarity`、
  `stackLimit`、`tradeable`、`buyPrice`、`sellPrice` 和 `effect`。
  `stackLimit` 为 `1–9999` 的整数，默认 `1`；`tradeable` 默认
  `true`，不参与买卖时为 `false`。`effect.mode` 取
  `description` 或 `script`，分别保存文字说明和脚本路径；脚本导入
  接口尚未接入运行时。
- 文档根新增可选 `itemTypeLibrary`，保存 `primaryTypes`（每项含
  `name` 与 `secondaryTypes`）和独立的 `rarities`。同名一级类型按
  名称合并；物品的一级类型、二级类型和稀有度必须引用库中已有
  名称。类型库在整个物品模块内共享。
- 物品条目使用可选 `illustration` 保存插图引用，记录素材 ID、文件
  名、显示名、项目相对路径、`folderId`、`folderPath` 和 `revision`。
  插图引用素材库的静态贴图，不复制文件；`null` 表示未设置。
- 关卡 V1–V4 会迁移到 V5；V1/V2 的背景字段会统一到
  `world.background`，V3 会补齐 `backgroundMusic: null`，V4 的音乐
  会补齐 `volume: 1` 与 `loop: true`。内容文档 V1–V15 可迁移到
  V16；V5 的前置对象会转换为条件数组。旧会话统一进入根目录，
  V3 的会话目录自动转换到
  `contentFolders.conversations`，V8 矩形攻击范围会转换为四点直线
  多边形，V9 物品会补齐类型库与默认交易/效果字段，V10 会补齐物品
  插图字段和动画来源的文件夹信息，V11 会按动画方向补齐触发键的
  左右方向，V12 仅提升版本以启用死亡动画类型，V13 会补齐动画帧
  音效并默认不循环，V14 会补齐角色攻击力、共享碰撞体和动画备注，
  V15 会把动画级攻击范围迁移为按帧保存的 `attackRanges`。

## 验证

```powershell
pnpm --filter contract test
pnpm --filter contract check
```
