---
title: "Row storage and columnar storage"
date: 2026-09-17
draft: false
summary: "Understand row and column storage through access patterns, compression, scans, and write cost."
description: "Understand row and column storage through access patterns, compression, scans, and write cost."
translationKey: "concept-columnar-storage"
type: "Concept"
topics:
  - ClickHouse
  - Doris
  - Spark
level: "Beginner"
tags:
  - storage
  - olap
---

## Start with the access pattern

Row and column storage are different trade-offs, not a simple ranking. Row layout fits processing a complete record together, while column scans can read only the fields a query needs and compress similar values effectively.

Once this is clear, file formats and scan operators in ClickHouse, Doris, and Spark become easier to reason about.
