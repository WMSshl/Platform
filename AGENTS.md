# Platform 工作区

## 三个包，一个依赖方向
platform_contract/  唯一真相源：schema、事件协议、版本策略
platform_editor/    编辑器：产出符合 contract 的数据
platform_dome/      游戏运行时：消费 contract 的数据
依赖单向：editor → contract ← dome。禁止 editor 与 dome 互相 import。

当前关卡 schema 版本：1。contract 包名固定为 `contract`，供根目录 pnpm 脚本筛选。

## 跨项目改动的唯一合法顺序
1. 改 platform_contract：新增字段必须可选 + 版本号 + 迁移函数
2. 改产出侧 editor
3. 改消费侧 dome
4. 跑 pnpm --filter contract test

常用入口：

- `pnpm test`
- `pnpm check`
- `pnpm --filter contract test`
- `pnpm --filter platform-dome-map-editor start`
- `pnpm --filter platform-dome start`

为了"让另一边跑通"而去改本项目的私有实现 = 迁就，禁止。
需要对方能力时，改 contract，让双方各自演进。

## 上下文预算（必读）
不要读取或索引：node_modules/ dist/ build/ out/ .next/ assets/bundled/

## 完成前必须列出
- 分项目列出改动文件
- contract 版本是否变化、是否向后兼容
- 各项目自己的验证命令与真实输出
