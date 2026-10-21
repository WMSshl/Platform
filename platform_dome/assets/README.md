# 资源目录说明

主角动作素材位于 `assets/player/`。每张图都是横向排列的精灵表，
单帧尺寸为 112×96，显示时按 3 倍最近邻缩放。

地图背景由编辑器导入到 `assets/map/backgrounds/`，关卡通过
`world.background.path` 引用。编辑器素材库与游戏资源是两份
明确的数据：导入动作会将选中的背景复制到游戏目录。

Tiled 背景素材组复制到 `assets/map/tiled/<素材组>/`，其中包含
原始 JSON/TMJ、外部 TSX、tileset 图片和运行时 `map.json`。关卡通过
`world.background` 且 `type = "tiled"`；Tiled 地图与单图背景互斥。

| 文件 | 帧数 | 用途 |
| --- | ---: | --- |
| `idle.png` | 14 | 待机 |
| `walk.png` | 8 | 行走 |
| `run.png` | 8 | 地面加速跑 |
| `jump.png` | 3 | 起跳 |
| `air.png` | 3 | 跳跃中段水平移动 |
| `fall.png` | 3 | 下落 |
| `guard.png` | 6 | 防御 |
| `guard-counter.png` | 11 | 格挡成功后的防御反击 |
| `attack-1.png` | 8 | 第一段攻击 |
| `attack-2.png` | 9 | 第二段攻击 |
| `attack-3.png` | 11 | 第三段攻击 |
| `hurt.png` | 8 | 受伤 |
| `death.png` | 15 | 死亡 |

其他角色暂时仍由 `PlaceholderTextureService` 在运行时生成占位纹理。

`guard-counter-source.png` 是 96×96 的原始序列图，游戏使用的
`guard-counter.png` 已按统一帧尺寸补齐为 112×96。

替换正式素材时请遵守以下原则：

- 角色使用 `actor:<角色ID>` 作为纹理键；例如 `actor:player`。
- 图片尺寸变化时，应同步修改 `data/configs/actors.json` 中的物理体型。
- UI、角色、敌人、道具、特效和地图素材分别放入当前同名子目录。
- 大量小图优先合并到 `atlases`，减少浏览器纹理切换。
- 文件名使用小写英文和连字符，不直接使用角色显示名称作为文件名。

