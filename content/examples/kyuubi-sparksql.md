---
title: "通过 Unified Query 使用 Kyuubi 执行 SparkSQL"
date: 2026-09-21
draft: false
summary: "用 Java 或 Python 复用 Kyuubi SQL Session 执行 SparkSQL，并在客户端等待窗口结束后继续查询 operation。"
description: "使用 Unified Query 的 Kyuubi SparkSQL Session API，覆盖连接、SQL 执行、handle 恢复、结果读取、异常处理与顺序 DDL/DML。"
toc: true
tocTitle: "本页目录"
translationKey: "example-unified-query-kyuubi-sparksql"
type: "示例文档"
topics:
  - Spark
  - Kyuubi
  - Unified Query
level: "进阶"
tags:
  - spark-sql
  - kyuubi
  - unified-query
---

Unified Query 的 Kyuubi SparkSQL Session API 通过 Kyuubi REST 创建可复用的 SQL session，并在其中逐条提交 SparkSQL。Java 和 Python SDK 都是同步调用接口：调用线程等待一段时间，若 operation 尚未完成则返回 operation handle，SQL 仍由 Kyuubi 执行。

它适合在服务端代码中提交 SQL、读取较小的查询结果，或保存 operation handle 稍后查询。它不会启动本地 Spark driver，也不提交 Kyuubi Batch 应用。

## 准备运行环境

- Kyuubi 已启用并可访问 REST API v1；Kyuubi 将此 REST API 标记为 experimental，协议实现以 Kyuubi 1.12.0 为基线。
- 客户端支持无认证或 HTTP Basic（用户名/密码）认证。需要 Kerberos/SPNEGO 等方式的部署，应由具备相应认证能力的网关提供 SDK 可访问的 REST endpoint。
- Unified Query 当前版本为 2.1.0。Maven 和 Python 制品必须已发布到本机/组织配置的仓库；Python 要求 3.12 或更高版本。
- Java 运行示例要求 JDK 11 或更高版本、Maven 3.6.3 或更高版本。

### Python：安装并运行

在当前工作目录下创建 `kyuubi-examples`，将 Python 和 Java 项目分别放在其中。以下命令都从这个当前工作目录运行，不需要切换目录。先创建 Python 环境，并将下方示例保存为 `kyuubi-examples/kyuubi-python-example/kyuubi_sparksql.py`：

~~~bash
mkdir -p kyuubi-examples/kyuubi-python-example
python3.12 -m venv kyuubi-examples/kyuubi-python-example/.venv
source kyuubi-examples/kyuubi-python-example/.venv/bin/activate
python -m pip install unified-query-api==2.1.0
~~~

pip 使用当前环境已配置的 package index；如果组织使用私有 index，请先按组织规范配置 pip。

### Java：配置 Maven 项目并运行

在同一个当前工作目录下执行以下命令创建 Java 项目目录：

~~~bash
mkdir -p kyuubi-examples/kyuubi-java-example/src/main/java/com/example
~~~

将下面的完整内容保存为 `kyuubi-examples/kyuubi-java-example/pom.xml`。编译目标为 Java 11；Exec Maven Plugin 用于启动示例，调用方式见 [官方使用文档](https://www.mojohaus.org/exec-maven-plugin/usage.html)。

~~~xml
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>kyuubi-sparksql-example</artifactId>
  <version>1.0-SNAPSHOT</version>
  <properties>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    <maven.compiler.release>11</maven.compiler.release>
  </properties>
  <dependencies>
    <dependency>
      <groupId>com.portofino.unifiedquery</groupId>
      <artifactId>unified-query</artifactId>
      <version>2.1.0</version>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <version>3.16.0</version>
      </plugin>
      <plugin>
        <groupId>org.codehaus.mojo</groupId>
        <artifactId>exec-maven-plugin</artifactId>
        <version>3.6.4</version>
      </plugin>
    </plugins>
  </build>
</project>
~~~

将下方 Java 示例原样保存为 `kyuubi-examples/kyuubi-java-example/src/main/java/com/example/KyuubiSqlSessionExample.java`。如制品仓库要求认证，请先在 Maven settings.xml 配置；不要把仓库凭据写进项目 pom.xml。

### 设置 Kyuubi 连接和等待窗口

以下命令适用于 macOS/Linux Bash 或 Zsh。用户名/密码不需要时可不设置；密码通过隐藏输入读取，不进入命令历史：

~~~bash
export KYUUBI_URI="https://kyuubi.example.internal"
export KYUUBI_USERNAME="your-username"
export KYUUBI_PASSWORD="$(python3.12 -c 'import getpass; print(getpass.getpass("Kyuubi password: "))')"
export UQ_SQL_WAIT_SECONDS=300
~~~

客户端等待窗口默认 300 秒；可用 UQ_SQL_WAIT_SECONDS 覆盖。示例 SQL 默认为 `SELECT 1 AS value`，也可通过 UQ_EXAMPLE_SQL 提供一条 SparkSQL。一次调用只提交一条 SQL。

### 启动快速查询示例

设置好连接环境变量并保存代码后，从前面创建的当前工作目录运行所选 SDK 的命令。Python 命令要求前面创建的虚拟环境仍处于激活状态：

~~~bash
# Python
python kyuubi-examples/kyuubi-python-example/kyuubi_sparksql.py

# Java
mvn -q -f kyuubi-examples/kyuubi-java-example/pom.xml compile exec:java -Dexec.mainClass=com.example.KyuubiSqlSessionExample
~~~

## SQL Session API 速查

本页只介绍 SQL Session API。它与 Kyuubi Batch API 的 Batch ID、状态、日志和取消操作是不同接口。

### 客户端与 Session

**创建客户端**

- Java：<code>new KyuubiSqlSessionClientJava(uri)</code>，或提供用户名、密码和请求超时：<code>new KyuubiSqlSessionClientJava(uri, user, password, requestTimeoutSeconds)</code>。
- Python：<code>KyuubiSqlSessionClient(uri, username=..., password=..., request_timeout_seconds=30)</code>。
- 请求超时只控制单次 HTTP 请求，默认 30 秒。

**创建 session**

- Java：<code>openSession()</code> 或 <code>openSession(configs)</code>。
- Python：<code>open_session(configs=None)</code>。
- 同一 session 可复用；SparkSQL session 设置 <code>kyuubi.session.engine.type=SPARK_SQL</code>。

### SQL 执行与查询

**提交一条 SQL**

- Java：<code>executeSql(session, sql)</code> 默认等待 300 秒；也可用 <code>executeSql(session, sql, syncWaitTimeoutSeconds)</code> 按次覆盖。
- Python：<code>execute_sql(session, sql, sync_wait_timeout_seconds=300)</code>。
- 每次调用只提交一条 SQL。

**查询 operation 状态**

- Java：<code>getOperationStatus(handle)</code>。
- Python：<code>get_operation_status(handle)</code>。
- 读取 Kyuubi 最近报告的状态，不读取结果行。

**继续等待并读取结果**

- Java：<code>getResult(handle)</code> 默认等待 300 秒；也可用 <code>getResult(handle, syncWaitTimeoutSeconds)</code> 覆盖。
- Python：<code>get_result(handle, sync_wait_timeout_seconds=300)</code>。
- 返回 COMPLETED、PENDING 或 FAILED；返回 PENDING 时可保留 handle 再次查询。

### 资源清理

**关闭 operation**

- Java：<code>closeOperation(handle)</code>。
- Python：<code>close_operation(handle)</code>。
- operation 进入终态且不再需要结果后释放资源。

**关闭 session**

- Java：<code>closeSession(session)</code>。
- Python：<code>close_session(session)</code>。
- 全部 SQL 和后续查询完成后关闭 session。

客户端等待窗口只控制 SDK 等多久，不是 Kyuubi 的 SQL 执行时限。SDK 不会在 SQL 请求中发送 <code>kyuubi.operation.query.timeout</code>，等待窗口耗尽也不会取消 SQL。SQL 执行上限由 Kyuubi 服务端配置决定；若服务端超时取消 SQL，SDK 返回 FAILED 和服务端状态/可用诊断。

## 创建 session 并提交一条 SQL

Java 包装层是 Scala 客户端的同步薄包装；Python API 也采用同步调用。结果分别通过 Java getters 和 Python 属性读取。

{{% code-example group="quick-start" lang="java" %}}
~~~java
package com.example;

import com.portofino.unifiedquery.submission.KyuubiSqlExecutionResultJava;
import com.portofino.unifiedquery.submission.KyuubiSqlOperationRequestException;
import com.portofino.unifiedquery.submission.KyuubiSqlOperationHandleJava;
import com.portofino.unifiedquery.submission.KyuubiSqlSessionClientJava;
import com.portofino.unifiedquery.submission.KyuubiSqlSessionHandleJava;
import java.util.Map;

public final class KyuubiSqlSessionExample {
    private static String requiredEnv(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Set environment variable " + name);
        }
        return value;
    }

    private static KyuubiSqlSessionClientJava newClient() {
        return new KyuubiSqlSessionClientJava(
            requiredEnv("KYUUBI_URI"),
            System.getenv().getOrDefault("KYUUBI_USERNAME", ""),
            System.getenv().getOrDefault("KYUUBI_PASSWORD", ""),
            30);
    }

    private static int waitSeconds() {
        return Integer.parseInt(System.getenv().getOrDefault("UQ_SQL_WAIT_SECONDS", "300"));
    }

    private static void printHandle(
            KyuubiSqlSessionHandleJava session,
            KyuubiSqlOperationHandleJava operation) {
        System.out.printf(
            "PENDING session_id=%s kyuubi_instance=%s operation_id=%s%n",
            session.getSessionId(),
            session.getKyuubiInstance(),
            operation.getOperationId());
    }

    private static void printOutcome(KyuubiSqlExecutionResultJava outcome) {
        if ("COMPLETED".equals(outcome.getKind())) {
            outcome.getColumns().forEach(column ->
                System.out.println(column.getName() + " " + column.getDataType()));
            System.out.println(outcome.getRows());
        } else {
            System.err.println(outcome.getStatus().getDiagnostic());
        }
    }

    private static void submit(KyuubiSqlSessionClientJava client) {
        var session = client.openSession(Map.of(
            "kyuubi.session.engine.type", "SPARK_SQL"));
        boolean keepSessionOpen = false;
        try {
            KyuubiSqlExecutionResultJava outcome;
            try {
                String sql = System.getenv().getOrDefault(
                    "UQ_EXAMPLE_SQL", "SELECT 1 AS value");
                outcome = client.executeSql(session, sql, waitSeconds());
            } catch (KyuubiSqlOperationRequestException error) {
                keepSessionOpen = true;
                var accepted = error.getOperationHandle();
                System.err.printf(
                    "PENDING session_id=%s kyuubi_instance=%s operation_id=%s%n",
                    accepted.session().sessionId(),
                    accepted.session().kyuubiInstance(),
                    accepted.operationId());
                throw error;
            } catch (RuntimeException error) {
                keepSessionOpen = true;
                System.err.printf(
                    "No handle was confirmed for session_id=%s on kyuubi_instance=%s; check Kyuubi before resubmitting.%n",
                    session.getSessionId(), session.getKyuubiInstance());
                throw error;
            }

            if ("PENDING".equals(outcome.getKind())) {
                keepSessionOpen = true;
                printHandle(session, outcome.getHandle());
                return;
            }

            printOutcome(outcome);
            client.closeOperation(outcome.getHandle());
        } finally {
            if (!keepSessionOpen) {
                client.closeSession(session);
            }
        }
    }

    private static void resume(KyuubiSqlSessionClientJava client) {
        var session = new KyuubiSqlSessionHandleJava(
            requiredEnv("UQ_KYUUBI_SESSION_ID"),
            requiredEnv("UQ_KYUUBI_INSTANCE"));
        var handle = new KyuubiSqlOperationHandleJava(
            session.getSessionId(),
            session.getKyuubiInstance(),
            requiredEnv("UQ_KYUUBI_OPERATION_ID"));

        try {
            System.out.println(client.getOperationStatus(handle).getState());
            var outcome = client.getResult(handle, waitSeconds());
            if ("PENDING".equals(outcome.getKind())) {
                printHandle(session, handle);
                return;
            }
            printOutcome(outcome);
            client.closeOperation(handle);
            client.closeSession(session);
        } catch (RuntimeException error) {
            printHandle(session, handle);
            throw error;
        }
    }

    public static void main(String[] args) {
        var client = newClient();
        if (args.length == 1 && "--resume".equals(args[0])) {
            resume(client);
        } else if (args.length == 0) {
            submit(client);
        } else {
            throw new IllegalArgumentException(
                "Usage: KyuubiSqlSessionExample [--resume]");
        }
    }
}
~~~
{{% /code-example %}}

{{% code-example group="quick-start" lang="python" %}}
~~~python
import argparse
import os
import sys

from unified_query_api import (
    KyuubiRequestError,
    KyuubiSqlOperationHandle,
    KyuubiSqlOperationRequestError,
    KyuubiSqlSessionClient,
    KyuubiSqlSessionHandle,
)


def required_env(name):
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Set environment variable {name}")
    return value


def new_client():
    return KyuubiSqlSessionClient(
        required_env("KYUUBI_URI"),
        username=os.environ.get("KYUUBI_USERNAME", ""),
        password=os.environ.get("KYUUBI_PASSWORD", ""),
        request_timeout_seconds=30,
    )


def wait_seconds():
    return int(os.environ.get("UQ_SQL_WAIT_SECONDS", "300"))


def print_handle(handle):
    print(
        "PENDING",
        f"session_id={handle.session.session_id}",
        f"kyuubi_instance={handle.session.kyuubi_instance}",
        f"operation_id={handle.operation_id}",
        flush=True,
    )


def print_outcome(outcome):
    if outcome.kind == "COMPLETED":
        print([(column.name, column.data_type) for column in outcome.columns])
        print(outcome.rows)
    else:
        print(outcome.status.diagnostic or outcome.status.state)


def submit(client):
    session = client.open_session({"kyuubi.session.engine.type": "SPARK_SQL"})
    keep_session_open = False
    try:
        try:
            outcome = client.execute_sql(
                session,
                os.environ.get("UQ_EXAMPLE_SQL", "SELECT 1 AS value"),
                sync_wait_timeout_seconds=wait_seconds(),
            )
        except KyuubiSqlOperationRequestError as error:
            keep_session_open = True
            print_handle(error.handle)
            raise
        except KyuubiRequestError:
            keep_session_open = True
            print(
                f"No handle was confirmed for session_id={session.session_id} and kyuubi_instance={session.kyuubi_instance}; check Kyuubi before resubmitting.",
                flush=True,
            )
            raise

        if outcome.kind == "PENDING":
            keep_session_open = True
            print_handle(outcome.handle)
            return

        print_outcome(outcome)
        client.close_operation(outcome.handle)
    finally:
        if not keep_session_open:
            client.close_session(session)


def resume(client):
    session = KyuubiSqlSessionHandle(
        session_id=required_env("UQ_KYUUBI_SESSION_ID"),
        kyuubi_instance=required_env("UQ_KYUUBI_INSTANCE"),
    )
    handle = KyuubiSqlOperationHandle(
        session=session,
        operation_id=required_env("UQ_KYUUBI_OPERATION_ID"),
    )

    try:
        print(client.get_operation_status(handle).state)
        outcome = client.get_result(handle, sync_wait_timeout_seconds=wait_seconds())
    except KyuubiRequestError:
        print_handle(handle)
        raise

    if outcome.kind == "PENDING":
        print_handle(handle)
        return

    print_outcome(outcome)
    client.close_operation(handle)
    client.close_session(session)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    client = new_client()
    if args.resume:
        resume(client)
    else:
        submit(client)


if __name__ == "__main__":
    main()
~~~
{{% /code-example %}}

COMPLETED 表示语句成功完成；查询结果通过 <code>columns</code> 和 <code>rows</code>（Java: <code>getColumns()</code>、<code>getRows()</code>）读取。FAILED 是 Kyuubi 报告的失败、取消、关闭或服务端超时等终态，可从 <code>status.diagnostic</code> 查看诊断。PENDING 表示客户端等待窗口耗尽或结果读取尚未完成；它不是失败，也不会取消 operation。

## 保存 handle 并稍后继续查询

当程序输出一行 PENDING 时，其中的 <code>operation_id</code> 是 operation 标识；稍后恢复还必须保存同一行里的 <code>session_id</code> 和 <code>kyuubi_instance</code>。这些值不含连接凭据，但只在 Kyuubi 仍保留对应 session/operation 时有效。SDK 不提供跨服务重启的持久任务登记表。

在同一个 shell 中复制 PENDING 行的三个值，设置环境变量后启动 resume 模式：

~~~bash
export UQ_KYUUBI_SESSION_ID='paste-session-id-here'
export UQ_KYUUBI_INSTANCE='paste-kyuubi-instance-here'
export UQ_KYUUBI_OPERATION_ID='paste-operation-id-here'

# Python：保持前面创建的虚拟环境已激活
python kyuubi-examples/kyuubi-python-example/kyuubi_sparksql.py --resume

# Java
mvn -q -f kyuubi-examples/kyuubi-java-example/pom.xml compile exec:java -Dexec.mainClass=com.example.KyuubiSqlSessionExample -Dexec.args=--resume
~~~

两个示例都会先调用 <code>getOperationStatus</code> / <code>get_operation_status</code>，再调用 <code>getResult</code> / <code>get_result</code> 等待并读取结果。若仍为 PENDING，程序会再次输出完整三项 handle；不要关闭 session 或 operation。只有 COMPLETED 或 FAILED 后才关闭 operation；全部 SQL 和后续查询完成后再关闭 session。若新开 shell，也要重新设置 KYUUBI_URI 和认证环境变量；运行 Python 示例前重新激活虚拟环境。

## 顺序执行 DROP、CREATE、INSERT 和 SELECT

每次 <code>executeSql</code> / <code>execute_sql</code> 只提交一条 SQL。以下场景由调用方在同一 session 中按顺序提交，并确认前一条成功进入终态后再提交下一条。它不是原子批次，也没有跨语句回滚；任一语句失败时，业务代码应停止后续步骤并按实际状态恢复。

下面的 helper 会在 operation 仍为 PENDING 时继续调用 <code>getResult</code> / <code>get_result</code>，失败时抛错，并在每条终态 operation 处理后调用 close API。每次等待使用 300 秒；长任务可继续等待，或把 handle 交给后续处理流程。

{{% code-example group="sequential-sql" lang="java" %}}
~~~java
package com.example;

import com.portofino.unifiedquery.submission.KyuubiSqlExecutionResultJava;
import com.portofino.unifiedquery.submission.KyuubiSqlOperationRequestException;
import com.portofino.unifiedquery.submission.KyuubiSqlOperationHandleJava;
import com.portofino.unifiedquery.submission.KyuubiSqlSessionClientJava;
import com.portofino.unifiedquery.submission.KyuubiSqlSessionHandleJava;
import java.util.Map;
import java.util.UUID;

public final class KyuubiSequentialSqlExample {
    private static boolean retainSessionForRecovery;

    private static String requiredEnv(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Set environment variable " + name);
        }
        return value;
    }

    private static KyuubiSqlSessionClientJava newClient() {
        return new KyuubiSqlSessionClientJava(
            requiredEnv("KYUUBI_URI"),
            System.getenv().getOrDefault("KYUUBI_USERNAME", ""),
            System.getenv().getOrDefault("KYUUBI_PASSWORD", ""),
            30);
    }

    private static void printHandle(KyuubiSqlOperationHandleJava handle) {
        var session = handle.getSession();
        System.err.printf(
            "PENDING session_id=%s kyuubi_instance=%s operation_id=%s%n",
            session.getSessionId(), session.getKyuubiInstance(), handle.getOperationId());
    }

    private static KyuubiSqlExecutionResultJava executeToTerminal(
            KyuubiSqlSessionClientJava client,
            KyuubiSqlSessionHandleJava session,
            String sql) {
        KyuubiSqlExecutionResultJava outcome;
        try {
            outcome = client.executeSql(session, sql, 300);
        } catch (KyuubiSqlOperationRequestException error) {
            retainSessionForRecovery = true;
            var accepted = error.getOperationHandle();
            System.err.printf(
                "PENDING session_id=%s kyuubi_instance=%s operation_id=%s%n",
                accepted.session().sessionId(),
                accepted.session().kyuubiInstance(),
                accepted.operationId());
            throw error;
        } catch (RuntimeException error) {
            retainSessionForRecovery = true;
            System.err.printf(
                "No handle was confirmed for session_id=%s on kyuubi_instance=%s; check Kyuubi before resubmitting.%n",
                session.getSessionId(), session.getKyuubiInstance());
            throw error;
        }

        while ("PENDING".equals(outcome.getKind())) {
            var handle = outcome.getHandle();
            try {
                System.out.println(client.getOperationStatus(handle).getState());
                outcome = client.getResult(handle, 300);
            } catch (RuntimeException error) {
                retainSessionForRecovery = true;
                printHandle(handle);
                throw error;
            }
        }

        if ("FAILED".equals(outcome.getKind())) {
            client.closeOperation(outcome.getHandle());
            return outcome;
        }

        try {
            client.closeOperation(outcome.getHandle());
        } catch (RuntimeException error) {
            retainSessionForRecovery = true;
            printHandle(outcome.getHandle());
            throw error;
        }
        return outcome;
    }

    public static void main(String[] args) {
        var client = newClient();
        var session = client.openSession(Map.of(
            "kyuubi.session.engine.type", "SPARK_SQL"));
        String table = "uq_example_" + UUID.randomUUID().toString().replace("-", "");
        boolean tableMayExist = false;

        try {
            var outcome = executeToTerminal(
                client, session, "DROP TABLE IF EXISTS " + table);
            if ("FAILED".equals(outcome.getKind())) {
                System.err.println(outcome.getStatus().getDiagnostic());
                return;
            }

            tableMayExist = true;
            outcome = executeToTerminal(client, session,
                "CREATE TABLE " + table + " (id INT, label STRING) USING PARQUET");
            if ("FAILED".equals(outcome.getKind())) {
                System.err.println(outcome.getStatus().getDiagnostic());
                return;
            }

            outcome = executeToTerminal(client, session,
                "INSERT INTO " + table + " VALUES (1, 'first'), (2, 'second')");
            if ("FAILED".equals(outcome.getKind())) {
                System.err.println(outcome.getStatus().getDiagnostic());
                return;
            }

            outcome = executeToTerminal(client, session,
                "SELECT id, label FROM " + table + " ORDER BY id");
            if ("FAILED".equals(outcome.getKind())) {
                System.err.println(outcome.getStatus().getDiagnostic());
                return;
            }
            System.out.println(outcome.getRows());

            outcome = executeToTerminal(client, session, "DROP TABLE IF EXISTS " + table);
            if ("FAILED".equals(outcome.getKind())) {
                System.err.println(outcome.getStatus().getDiagnostic());
                return;
            }
            tableMayExist = false;
        } finally {
            if (!retainSessionForRecovery) {
                if (tableMayExist) {
                    var cleanup = executeToTerminal(
                        client, session, "DROP TABLE IF EXISTS " + table);
                    if ("FAILED".equals(cleanup.getKind())) {
                        System.err.println(cleanup.getStatus().getDiagnostic());
                    }
                }
                if (!retainSessionForRecovery) {
                    client.closeSession(session);
                }
            }
        }
    }
}
~~~
{{% /code-example %}}

{{% code-example group="sequential-sql" lang="python" %}}
~~~python
import os
import sys
from uuid import uuid4

from unified_query_api import (
    KyuubiRequestError,
    KyuubiSqlOperationRequestError,
    KyuubiSqlSessionClient,
)


def required_env(name):
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Set environment variable {name}")
    return value


def wait_seconds():
    return int(os.environ.get("UQ_SQL_WAIT_SECONDS", "300"))


def print_handle(handle):
    print(
        "PENDING",
        f"session_id={handle.session.session_id}",
        f"kyuubi_instance={handle.session.kyuubi_instance}",
        f"operation_id={handle.operation_id}",
        file=sys.stderr,
        flush=True,
    )


def main():
    client = KyuubiSqlSessionClient(
        required_env("KYUUBI_URI"),
        username=os.environ.get("KYUUBI_USERNAME", ""),
        password=os.environ.get("KYUUBI_PASSWORD", ""),
        request_timeout_seconds=30,
    )
    session = client.open_session({"kyuubi.session.engine.type": "SPARK_SQL"})
    table = "uq_example_" + uuid4().hex
    retain_session_for_recovery = False
    table_may_exist = False

    def execute_to_terminal(sql):
        nonlocal retain_session_for_recovery
        try:
            outcome = client.execute_sql(
                session, sql, sync_wait_timeout_seconds=wait_seconds()
            )
        except KyuubiSqlOperationRequestError as error:
            retain_session_for_recovery = True
            print_handle(error.handle)
            raise
        except KyuubiRequestError:
            retain_session_for_recovery = True
            print(
                f"No handle was confirmed for session_id={session.session_id} and kyuubi_instance={session.kyuubi_instance}; check Kyuubi before resubmitting.",
                file=sys.stderr,
            )
            raise

        while outcome.kind == "PENDING":
            handle = outcome.handle
            try:
                print(client.get_operation_status(handle).state)
                outcome = client.get_result(
                    handle, sync_wait_timeout_seconds=wait_seconds()
                )
            except KyuubiRequestError:
                retain_session_for_recovery = True
                print_handle(handle)
                raise

        if outcome.kind == "FAILED":
            client.close_operation(outcome.handle)
            return outcome

        try:
            client.close_operation(outcome.handle)
        except KyuubiRequestError:
            retain_session_for_recovery = True
            print_handle(outcome.handle)
            raise
        return outcome

    try:
        outcome = execute_to_terminal(f"DROP TABLE IF EXISTS {table}")
        if outcome.kind == "FAILED":
            print(outcome.status.diagnostic or outcome.status.state)
            return 1

        table_may_exist = True
        outcome = execute_to_terminal(
            f"CREATE TABLE {table} (id INT, label STRING) USING PARQUET"
        )
        if outcome.kind == "FAILED":
            print(outcome.status.diagnostic or outcome.status.state)
            return 1

        outcome = execute_to_terminal(
            f"INSERT INTO {table} VALUES (1, 'first'), (2, 'second')"
        )
        if outcome.kind == "FAILED":
            print(outcome.status.diagnostic or outcome.status.state)
            return 1

        outcome = execute_to_terminal(
            f"SELECT id, label FROM {table} ORDER BY id"
        )
        if outcome.kind == "FAILED":
            print(outcome.status.diagnostic or outcome.status.state)
            return 1
        print(outcome.rows)

        outcome = execute_to_terminal(f"DROP TABLE IF EXISTS {table}")
        if outcome.kind == "FAILED":
            print(outcome.status.diagnostic or outcome.status.state)
            return 1
        table_may_exist = False
        return 0
    finally:
        if not retain_session_for_recovery:
            if table_may_exist:
                cleanup = execute_to_terminal(f"DROP TABLE IF EXISTS {table}")
                if cleanup.kind == "FAILED":
                    print(cleanup.status.diagnostic or cleanup.status.state)
            if not retain_session_for_recovery:
                client.close_session(session)


if __name__ == "__main__":
    raise SystemExit(main())
~~~
{{% /code-example %}}

保存 Java 程序为 `kyuubi-examples/kyuubi-java-example/src/main/java/com/example/KyuubiSequentialSqlExample.java`，Python 程序保存为 `kyuubi-examples/kyuubi-python-example/kyuubi_sparksql_sequence.py`。从前面创建的当前工作目录运行：

~~~bash
# Java
mvn -q -f kyuubi-examples/kyuubi-java-example/pom.xml compile exec:java -Dexec.mainClass=com.example.KyuubiSequentialSqlExample

# Python：虚拟环境需已激活
python kyuubi-examples/kyuubi-python-example/kyuubi_sparksql_sequence.py
~~~

此 API 接收 SQL 字符串，不会自动参数化动态值。示例表名由固定前缀和 UUID 生成；业务输入参与 SQL 标识符拼接前必须自行校验。

## 返回对象与生命周期

| 返回对象 | Java 访问方式 | Python 访问方式 |
| --- | --- | --- |
| Session handle | <code>getSessionId()</code>、<code>getKyuubiInstance()</code> | <code>session_id</code>、<code>kyuubi_instance</code> |
| Operation handle | <code>getOperationId()</code>、<code>getSession()</code> | <code>operation_id</code>、<code>session</code> |
| Execution result | <code>getKind()</code>、<code>getHandle()</code>、<code>getStatus()</code>、<code>getColumns()</code>、<code>getRows()</code> | <code>kind</code>、<code>handle</code>、<code>status</code>、<code>columns</code>、<code>rows</code>；另有 <code>is_completed</code>、<code>is_pending</code>、<code>is_failed</code> |
| Operation status | <code>getState()</code>、<code>getStatement()</code>、<code>getDiagnostic()</code>、<code>getCreateTime()</code>、<code>getStartTime()</code>、<code>getCompleteTime()</code>、<code>isTerminal()</code>、<code>isSuccessful()</code> | <code>state</code>、<code>statement</code>、<code>diagnostic</code>、<code>create_time</code>、<code>start_time</code>、<code>complete_time</code>、<code>is_terminal</code>、<code>is_successful</code> |
| Result column | <code>getName()</code>、<code>getDataType()</code>、<code>getPosition()</code>、<code>getPrecision()</code>、<code>getScale()</code>、<code>getComment()</code> | <code>name</code>、<code>data_type</code>、<code>position</code>、<code>precision</code>、<code>scale</code>、<code>comment</code> |

SDK 将返回的行完整读取到客户端内存。结果集很大时应在 SQL 中限制返回量。DDL/DML 是否返回列和行由 Kyuubi 决定；SDK 不保证提供通用受影响行数。

session/operation 的可查询时间受 Kyuubi idle timeout、服务端回收和实例可用性影响。保存 handle 时也保存 Kyuubi instance 路由信息。SDK 没有跨服务重启的持久任务登记表；如果之后要查询，不要关闭仍为 PENDING 的 operation 或 session。

## 错误处理与限制

- SQL 已被接受，但 <code>executeSql</code> / <code>execute_sql</code> 的后续状态或结果请求失败时，Java 的 <code>KyuubiSqlOperationRequestException</code> 和 Python 的 <code>KyuubiSqlOperationRequestError</code> 携带 operation handle。先保存 handle 并查询状态，不要盲目重提有副作用的 SQL。
- 如果等待窗口在提交前读取 session operations 快照时耗尽，SQL 还没有发出，SDK 会抛传输错误且不会返回 handle。只有 SQL 已提交或提交结果正在对账时，才可能得到 operation handle。
- 如果 SQL 提交响应丢失，且 SDK 无法唯一确认 operation，会报告提交结果未知。不要自动重放；先通过 Kyuubi 管理接口或服务端日志核实 operation。
- <code>closeOperation</code> / <code>close_operation</code> 用于不再需要结果后的资源清理，不是客户端等待超时后的自动取消接口。SQL Session API 不提供 SQL cancel 方法。
- SQL Session API 不支持多语句批次、事务原子性或回滚。依赖语句由调用方逐条提交并检查终态。
- SQL Session operation handle 与 Kyuubi Batch ID 是不同资源标识；本示例只展示 SQL Session。
- 当前协议基线为 Kyuubi 1.12.0。请确认部署版本启用了该 API：[Kyuubi REST API v1](https://kyuubi.readthedocs.io/en/v1.12.0/client/rest/rest_api.html)。
