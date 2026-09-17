---
title: "ClickHouse"
date: 2026-09-17
draft: false
summary: "围绕 MergeTree、排序键、分区和查询执行，拆解 ClickHouse 的分析型路径。"
description: "围绕 MergeTree、排序键、分区和查询执行，拆解 ClickHouse 的分析型路径。"
translationKey: "docs-clickhouse"
type: "文档"
topics:
  - ClickHouse
level: "入门"
tags:
  - clickhouse
  - olap
---

## 专题路线

- MergeTree：数据写入、数据片段和后台合并。
- 排序键：如何影响数据定位、扫描范围和表设计。
- 分区：什么时候有帮助，什么时候只是管理边界。
- 查询执行：从 SQL、计划到聚合和并行处理。

后续文章会把表结构、数据规模和查询模式写清楚，避免脱离场景讨论“最佳实践”。
