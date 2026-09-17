---
title: "What is shuffle?"
date: 2026-09-17
draft: false
summary: "Why distributed systems redistribute data, and where shuffle cost comes from."
description: "Why distributed systems redistribute data, and where shuffle cost comes from."
translationKey: "concept-shuffle"
type: "Concept"
topics:
  - Spark
  - Ray
level: "Beginner"
tags:
  - shuffle
  - distributed-computing
---

## Why data moves

When computation needs to reorganize data by a new key, partition, or parallelism level, data may move across processes or machines. That redistribution can add serialization, network, disk, and downstream merge costs.

Understanding shuffle is a useful entry point for reading Spark stages, distributed joins, and many data-processing performance problems.
