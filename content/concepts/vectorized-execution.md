---
title: "什么是向量化执行"
date: 2026-09-17
draft: false
summary: "用批量处理而不是逐行处理理解向量化执行，以及它为什么常出现在 OLAP 系统中。"
description: "用批量处理而不是逐行处理理解向量化执行，以及它为什么常出现在 OLAP 系统中。"
translationKey: "concept-vectorized-execution"
type: "科普"
topics:
  - ClickHouse
  - Doris
  - Daft
level: "入门"
tags:
  - execution
  - performance
---

## 从逐行到批量

向量化执行把一批值作为整体交给过滤、投影或聚合算子，减少循环、函数调用和数据搬运的固定成本。它不是单独的魔法优化，仍然会受到数据类型、内存布局和算子组合的影响。

后续会用小型数据集展示批处理如何改变执行路径，并连接到具体项目的执行计划。
