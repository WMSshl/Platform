# Platform Dome

## 职责

- 只消费符合 `platform_contract` 的关卡与配置数据，不实现编辑能力。
- 禁止直接 import `platform_editor` 的源码；跨项目数据只通过磁盘 JSON 与 contract 交互。
- 数据不合预期时抛出 contract 校验错误，禁止在运行时静默兜底。

## 热路径

- 每帧代码禁止新增临时对象、反射访问或字符串拼接 key。
- 资源、关卡迁移、注册表与数据解析在 loading 阶段完成，运行时只读。

## 扩展性

- 新玩法系统通过 `src/gameplay/systems/GameplaySystemRegistry.js` 注册。
- 禁止在 `GameWorld.update()` 主循环中追加玩法类型条件分支。
