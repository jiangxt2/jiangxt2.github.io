---
title: "Spark vs Daft：数据处理模型的差异"
date: 2026-09-17
draft: false
summary: "比较 Spark 与 Daft 在数据抽象、执行计划、生态和适用场景上的差异。"
description: "比较 Spark 与 Daft 在数据抽象、执行计划、生态和适用场景上的差异。"
translationKey: "comparison-spark-vs-daft"
type: "对比"
topics:
  - Spark
  - Daft
level: "进阶"
tags:
  - spark
  - daft
  - dataframe
---

## 比较维度

- DataFrame 和表达式抽象如何组织计算
- 惰性计划、算子和执行引擎如何衔接
- 文件、列式数据和分区处理方式
- 生态成熟度、扩展方式和部署边界

重点不是判断谁“更快”，而是厘清两个项目解决的问题是否相同，以及在同一条数据链路中是否可以互补。
