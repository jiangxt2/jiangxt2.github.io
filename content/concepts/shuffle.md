---
title: "Shuffle 是什么"
date: 2026-09-17
draft: false
summary: "解释分布式计算为什么需要重新分布数据，以及 Shuffle 的成本从哪里来。"
description: "解释分布式计算为什么需要重新分布数据，以及 Shuffle 的成本从哪里来。"
translationKey: "concept-shuffle"
type: "科普"
topics:
  - Spark
  - Ray
level: "入门"
tags:
  - shuffle
  - distributed-computing
---

## 数据为什么要搬家

当计算需要按新的键、分区或并行度重新组织数据时，数据就可能跨进程或跨机器移动。这个重新分布过程通常会引入序列化、网络、磁盘和下游合并成本。

理解 Shuffle，是阅读 Spark 阶段、分布式 Join 和许多数据处理性能问题的入口。
