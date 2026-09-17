---
title: "What is vectorized execution?"
date: 2026-09-17
draft: false
summary: "Understand vectorized execution as batch processing instead of row-at-a-time work, especially in OLAP systems."
description: "Understand vectorized execution as batch processing instead of row-at-a-time work, especially in OLAP systems."
translationKey: "concept-vectorized-execution"
type: "Concept"
topics:
  - ClickHouse
  - Doris
  - Daft
level: "Beginner"
tags:
  - execution
  - performance
---

## From rows to batches

Vectorized execution passes a batch of values through filters, projections, or aggregates as a unit, reducing fixed costs from loops, calls, and data movement. It is not a magic optimization; data types, memory layout, and operator composition still matter.

Future notes will use small datasets to show how batching changes an execution path and connect it to concrete project plans.
