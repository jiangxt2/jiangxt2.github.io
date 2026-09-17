---
title: "行式存储与列式存储"
date: 2026-09-17
draft: false
summary: "从访问模式、压缩、扫描和写入代价理解行式与列式存储。"
description: "从访问模式、压缩、扫描和写入代价理解行式与列式存储。"
translationKey: "concept-columnar-storage"
type: "科普"
topics:
  - ClickHouse
  - Doris
  - Spark
level: "入门"
tags:
  - storage
  - olap
---

## 先问访问模式

行式和列式不是“谁更先进”的关系，而是对访问模式的不同取舍。按行读取适合一起处理一条记录，按列扫描则更容易只读取查询需要的字段，并利用相似值进行压缩。

理解这个概念后，再去看 ClickHouse、Doris 或 Spark 的文件格式和扫描算子，会更容易分辨设计选择。
