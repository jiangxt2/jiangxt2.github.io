---
title: "Daft"
date: 2026-09-17
draft: false
summary: "记录 DataFrame、物理执行计划和分布式数据处理之间的联系。"
description: "记录 DataFrame、物理执行计划和分布式数据处理之间的联系。"
translationKey: "docs-daft"
type: "文档"
topics:
  - Daft
level: "入门"
tags:
  - daft
  - dataframe
---

## 专题路线

- DataFrame：从表达式和惰性计算组织数据处理。
- 物理计划：如何阅读算子、扫描、过滤和聚合。
- 数据格式：列式数据、分区和文件扫描之间的关系。
- 扩展边界：与 Spark、Ray 及其他执行系统如何组合。

后续文章会优先使用小数据集和可运行代码，逐步补齐执行语义与性能实验。
