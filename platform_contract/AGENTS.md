# Platform Contract

## 职责

- 本目录是关卡 schema、跨项目字段、版本策略和迁移函数的唯一真相源。
- 不依赖 `platform_editor` 或 `platform_dome`，也不包含任何一方的私有实现。
- 编辑器负责生产符合本协议的文档，游戏运行时负责消费并校验同一份文档。

## 修改规则

1. 新增关卡字段必须可选，并在 `src/level/schema.js` 声明其稳定语义。
2. 修改已持久化结构时必须提升 `CURRENT_LEVEL_SCHEMA_VERSION`。
3. 旧版本必须提供可重复执行的迁移函数，禁止悄悄改变已有字段含义。
4. 校验、默认值和迁移都放在本目录；editor 与 dome 只能调用，不得复制规则。

## 验证

```powershell
pnpm --filter contract test
pnpm --filter contract check
```
