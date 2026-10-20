# Platform Contract

`contract` 是穹顶回响编辑器与游戏运行时之间的唯一数据协议层。

## 边界

- `platform_editor` 产出符合 contract 的关卡 JSON。
- `platform_dome` 只消费经过 contract 校验的数据。
- contract 不依赖 editor 或 dome，也不包含 UI、Phaser 或文件系统实现。

## 版本

当前关卡 schema 版本为 `1`。

- `schemaVersion` 是可选输入字段；缺失时按旧版数据迁移。
- 迁移后的文档始终写入当前 `schemaVersion`。
- 未来版本只能追加可选字段或通过迁移函数改变旧字段含义。

## 验证

```powershell
pnpm --filter contract test
pnpm --filter contract check
```
