---
title: "ClickHouse"
date: 2026-09-17
draft: false
summary: "A practical path through MergeTree, ordering keys, partitions, and query execution."
description: "A practical path through MergeTree, ordering keys, partitions, and query execution."
translationKey: "docs-clickhouse"
type: "Docs"
topics:
  - ClickHouse
level: "Beginner"
tags:
  - clickhouse
  - olap
---

## Topic path

- MergeTree: writes, data parts, and background merges.
- Ordering keys: how they affect data skipping, scans, and table design.
- Partitions: when they help and when they are only an administrative boundary.
- Query execution: from SQL and plans to aggregation and parallel work.

Future notes will make the schema, data scale, and query pattern explicit instead of discussing “best practices” without context.
