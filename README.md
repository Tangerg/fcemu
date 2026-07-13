# FC Emu

一个按真实 NES 硬件边界组织的 FC/NES 浏览器模拟器 monorepo。CPU、PPU、APU、卡带与控制器
是天然限界上下文；工程只借用领域驱动和整洁架构的依赖思想，不套用业务系统目录模板。

## Packages

- `@fcemu/core`：平台无关的模拟器核心，可独立构建；不依赖 React 或浏览器 API。
- `@fcemu/ui`：React 工作台，拥有独立的领域、应用、基础设施、表现层与组合根。

详细边界见 [docs/architecture.md](./docs/architecture.md)。
硬件资料优先级与代码映射见 [docs/hardware-reference.md](./docs/hardware-reference.md)。
持续演进与已知正确性工作见 [docs/engineering-roadmap.md](./docs/engineering-roadmap.md)。
Mapper 支持证据见 [docs/mapper-compatibility.md](./docs/mapper-compatibility.md)。
iNES / NES 2.0 格式边界见 [docs/cartridge-formats.md](./docs/cartridge-formats.md)。

## Development

要求 Node.js 20+ 与 Yarn 1.22。

```bash
yarn install
yarn dev
```

浏览器键盘控制：

- P1：`W` / `A` / `S` / `D` 移动，`J` / `K` 对应 A / B，`Enter` 开始，`Space` 选择。
- P2：方向键移动，主键盘或小键盘的 `0` / `1` 对应 A / B。

标准 Gamepad 会按稳定连接槽映射到玩家一、玩家二，并支持方向轴与 D-pad。
带电池的卡带会按 ROM 内容标识自动从 IndexedDB 恢复并定期保存进度。
工作台可选择 `AUTO` / `NTSC` / `PAL` / `DENDY` 执行区域；切换时会保留电池存档和当前暂停状态。
当前会话支持内存内快速快照与恢复；快照独立于电池存档，不会写入 ROM 或 IndexedDB。

## Quality gates

```bash
yarn quality        # typecheck + lint + format + tests + knip + architecture
yarn build          # build core package and production UI
yarn check:layers   # clean-architecture and package-boundary rules
yarn check:circular # runtime import cycles
yarn benchmark:core # FrameBuffer、整机帧循环与 Save State 基准
yarn conformance:rom -- /path/test.nes [frames] [ntsc|pal|dendy] [blargg|zero-page]
yarn conformance:mmc1 -- /path/to/holy-mapperel-bin-0.02
yarn conformance:mapper34 -- /path/to/holy-mapperel-bin-0.02
```
