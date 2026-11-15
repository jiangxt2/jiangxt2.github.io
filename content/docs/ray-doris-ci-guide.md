---
title: "ray-doris 的 CI 流程与实践"
date: 2026-11-15
draft: false
summary: "了解 ray-doris 如何使用 GitHub Actions 检查代码、兼容性和真实 Doris 集成，以及其他项目可以借鉴的做法。"
description: "以 ray-doris 为例，介绍日常 CI 检查、Doris 容器测试和按需分布式测试。"
toc: true
tocTitle: "本页目录"
type: "技术文档"
topics:
  - CI
  - GitHub Actions
  - Ray
  - Doris
level: "进阶"
tags:
  - ci
  - github-actions
  - ray-doris
---

## 为什么需要 CI

ray-doris 是一个独立维护的 Ray Data 与 Apache Doris 连接器。除了检查 Python 代码，它还需要验证不同 Ray 版本的兼容性，以及连接真实 Doris 服务时的读写行为。项目使用 GitHub Actions 自动执行日常检查，并把多节点分布式测试放在独立的按需工作流中。

本文依据 [ray-doris 的 `60d033b` 提交](https://github.com/jiangxt2/ray-doris/tree/60d033bef92f7a98c0f62e0884dd8bed6d42262f)编写。配置和版本可能变化，使用时请核对最新的 workflow 和贡献指南。本文介绍配置的检查范围，不代表某次运行已经通过。

## CI 什么时候运行

[常规 CI](https://github.com/jiangxt2/ray-doris/blob/60d033bef92f7a98c0f62e0884dd8bed6d42262f/.github/workflows/ci.yml) 在 PR、推送到 `master` 和每周定时运行时触发，也支持被其他 workflow 调用。它包含以下检查：

| 检查 | 主要内容 |
| --- | --- |
| 单元与契约测试 | 在多个 Python / Ray 组合下运行测试 |
| 代码质量 | 格式、lint、类型及自动化配置检查 |
| 文档 | 文档检查、构建、拼写及外链检查 |
| Doris 集成 | 启动真实 Doris 容器并运行集成测试 |
| 安装包 | 构建并安装发行包，检查依赖与导入 |

常规 CI 和分支保护是两回事：workflow 定义了执行哪些检查，哪些检查必须通过才能合并还取决于仓库设置。

## 常规 CI 做什么

### 单元与契约测试

项目使用六组 Python / Ray 组合，覆盖 Python 3.9 至 3.13 和选定的 Ray 版本。这些组合并非所有版本的笛卡尔积：矩阵用有限的运行次数覆盖项目选择的兼容性边界。每组测试运行 `tests/unit` 和 `tests/contract`，并输出覆盖率以及实际解析的关键依赖版本。

矩阵中的单元和契约测试不等于每个组合都验证了真实 Doris。常规 Doris 集成 job 使用 Python 3.12、Ray 2.59.0 和 Doris 4.0.6；完整组合以 [workflow](https://github.com/jiangxt2/ray-doris/blob/60d033bef92f7a98c0f62e0884dd8bed6d42262f/.github/workflows/ci.yml) 为准。

### 代码质量与文档

代码质量 job 使用 Ruff 检查格式和 lint，使用 mypy 检查类型，并运行 pre-commit 和 workflow 配置检查。文档 job 在独立环境中运行文档契约检查、Sphinx strict 构建、拼写和外链检查。

### 安装包

项目构建 wheel 和 sdist，使用 Twine 检查包，再在隔离环境中安装、检查依赖并导入；部分环境还检查 Flight 可选依赖。这有助于发现源码测试正常，但用户安装发行包时才出现的问题。

## 真实 Doris 测试怎么运行

常规 CI 的 Doris 集成 job 大致按以下顺序执行：

1. 分别构建 Doris FE 和 BE 测试镜像。
2. 用 Docker Compose 启动服务，并通过 `--no-build` 避免启动时再次构建。
3. 运行 `tests/integration`，验证连接器与真实 Doris 的交互。
4. 尝试收集并上传 Doris 日志，再清理 Compose 测试资源。

收集日志和清理步骤设置为在前面步骤成功或失败后执行，但运行被中断或基础设施异常时，仍应检查资源是否已清理。排查失败时，先区分镜像构建、服务启动和测试执行，再查看对应日志。[贡献指南](https://github.com/jiangxt2/ray-doris/blob/60d033bef92f7a98c0f62e0884dd8bed6d42262f/CONTRIBUTING.md)提供了本地运行命令和测试范围。

## 慢速分布式测试

[慢速分布式测试](https://github.com/jiangxt2/ray-doris/blob/60d033bef92f7a98c0f62e0884dd8bed6d42262f/.github/workflows/slow-integration.yml)使用专用的 self-hosted Linux runner，支持手动触发或被其他 workflow 调用，**不会由常规 PR CI 自动运行**。它使用多节点 Ray 与 Doris 拓扑，覆盖常规单机集成测试之外的分布式场景。

`core` profile 用于诊断 tablet 任务数量和 worker 分布；`full` 覆盖更完整的分布式场景。涉及调度、重试、Flight SQL、TLS 或分布式执行的改动，应根据[贡献指南](https://github.com/jiangxt2/ray-doris/blob/60d033bef92f7a98c0f62e0884dd8bed6d42262f/CONTRIBUTING.md)选择相应验证。这些是功能测试，不是性能基准。

## 其他项目如何参考

- 先为每次 PR 建立适合项目的基础检查，例如格式、静态检查、单元测试和包构建。
- 有数据库或其他外部服务时，增加真实服务集成测试，并保留失败日志、清理本次测试资源。
- 用明确的版本组合覆盖项目支持的关键环境，同时写清哪些组合经过真实服务测试。
- 将多节点或耗时测试单独组织，说明何时运行、需要什么资源，以及它能验证什么。
- 根据项目的技术栈和风险调整检查，不必照搬 ray-doris 的版本矩阵或测试拓扑。

## 参考资料

- [ray-doris 常规 CI workflow](https://github.com/jiangxt2/ray-doris/blob/60d033bef92f7a98c0f62e0884dd8bed6d42262f/.github/workflows/ci.yml)
- [ray-doris 慢速分布式测试 workflow](https://github.com/jiangxt2/ray-doris/blob/60d033bef92f7a98c0f62e0884dd8bed6d42262f/.github/workflows/slow-integration.yml)
- [ray-doris 贡献指南](https://github.com/jiangxt2/ray-doris/blob/60d033bef92f7a98c0f62e0884dd8bed6d42262f/CONTRIBUTING.md)
