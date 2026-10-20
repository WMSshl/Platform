# Platform Editor

## 职责

- 只生产符合 `platform_contract` 的关卡数据，不实现或复制游戏运行时逻辑。
- 禁止直接 import `platform_dome` 的源码；跨项目数据只通过磁盘 JSON 与 contract 交互。
- 新增运行时能力必须先修改 contract，再分别更新 editor 与 dome。

## 可扩展性

- 新增可编辑对象类型必须通过 `src/model/EditorTypeRegistry.js` 注册。
- 禁止为新增机关或对象类型追加 `switch` / 条件链。
- 类型注册应同时声明放置工厂、选择集、稳定 ID 前缀和 UI 描述。

## 性能

- 编辑器视口和素材操作使用局部增量更新。
- 禁止在每次拖动或选择变化时全量重建文档；历史记录仍需保持纯数据处理。
