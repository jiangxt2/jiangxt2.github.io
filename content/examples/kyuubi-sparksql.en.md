---
title: "Run SparkSQL on Kyuubi with Unified Query"
date: 2026-09-21
draft: false
summary: "Reuse a Kyuubi SQL session from Java or Python, then resume an operation after the client wait window expires."
description: "Use Unified Query's Kyuubi SparkSQL Session API for connection setup, SQL execution, handle recovery, results, errors, and sequential DDL/DML."
toc: true
tocTitle: "On this page"
translationKey: "example-unified-query-kyuubi-sparksql"
type: "Example"
topics:
  - Spark
  - Kyuubi
  - Unified Query
level: "Intermediate"
tags:
  - spark-sql
  - kyuubi
  - unified-query
---

Unified Query's Kyuubi SparkSQL Session API creates a reusable SQL session through Kyuubi REST and submits SparkSQL one statement at a time. Both SDKs use synchronous calls: the caller waits for a configured window, then receives an operation handle if execution or result fetching is still pending. Kyuubi continues to execute the SQL.

Use it to submit SQL from a service, read a small result, or save an operation handle and query it later. It does not start a local Spark driver or submit a Kyuubi Batch application.

## Prepare the runtime

- Kyuubi REST API v1 is enabled and reachable. Kyuubi documents this API as experimental; the implementation uses Kyuubi 1.12.0 as its protocol baseline.
- The SDK supports unauthenticated access or HTTP Basic authentication with a username and password. Deployments requiring Kerberos/SPNEGO need an authentication gateway that exposes a REST endpoint the SDK can access.
- Unified Query is currently version 2.1.0. The Maven and Python artifacts must be published to repositories configured in your environment; Python 3.12 or later is required.
- The Java example targets Java 11 and uses Maven 3.6.3 or later.

### Python: install and run

From your current working directory, create a `kyuubi-examples` directory with separate Python and Java projects. Run all setup commands from this same working directory; they do not change directories. First create the Python environment and save the example below as `kyuubi-examples/kyuubi-python-example/kyuubi_sparksql.py`:

~~~bash
mkdir -p kyuubi-examples/kyuubi-python-example
python3.12 -m venv kyuubi-examples/kyuubi-python-example/.venv
source kyuubi-examples/kyuubi-python-example/.venv/bin/activate
python -m pip install unified-query-api==2.1.0
~~~

pip uses the package index configured in your environment. If your organization uses a private index, configure it according to your organization's instructions first.

### Java: configure Maven and run

From the same working directory, run these commands to create the Java project:

~~~bash
mkdir -p kyuubi-examples/kyuubi-java-example/src/main/java/com/example
~~~

Save the complete content below as `kyuubi-examples/kyuubi-java-example/pom.xml`. It targets Java 11. The Exec Maven Plugin runs the example; see the [official usage guide](https://www.mojohaus.org/exec-maven-plugin/usage.html) for invocation details.

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

Save the Java quickstart below as `kyuubi-examples/kyuubi-java-example/src/main/java/com/example/KyuubiSqlSessionExample.java`. If your artifact repository requires authentication, configure Maven settings.xml; do not put repository credentials in the project pom.xml.

### Set the Kyuubi connection and wait window

These commands are for macOS/Linux Bash or Zsh. Leave the username/password unset for unauthenticated access. The hidden prompt keeps the password out of shell history:

~~~bash
export KYUUBI_URI="https://kyuubi.example.internal"
export KYUUBI_USERNAME="your-username"
export KYUUBI_PASSWORD="$(python3.12 -c 'import getpass; print(getpass.getpass("Kyuubi password: "))')"
export UQ_SQL_WAIT_SECONDS=300
~~~

The client wait window defaults to 300 seconds and can be overridden with UQ_SQL_WAIT_SECONDS. The sample SQL defaults to `SELECT 1 AS value`; set UQ_EXAMPLE_SQL to submit another single SparkSQL statement.

### Run the quick query example

After setting the connection variables and saving the source files, run the command for your SDK from the working directory used above. The Python command requires the virtual environment created earlier to remain active:

~~~bash
# Python
python kyuubi-examples/kyuubi-python-example/kyuubi_sparksql.py

# Java
mvn -q -f kyuubi-examples/kyuubi-java-example/pom.xml compile exec:java -Dexec.mainClass=com.example.KyuubiSqlSessionExample
~~~

## SQL Session API reference

This page covers only the SQL Session API. It is separate from the Kyuubi Batch API, which has its own batch IDs, status, logs, and cancellation operations.

### Client and session

**Create a client**

- Java: <code>new KyuubiSqlSessionClientJava(uri)</code>, or provide credentials and request timeout: <code>new KyuubiSqlSessionClientJava(uri, user, password, requestTimeoutSeconds)</code>.
- Python: <code>KyuubiSqlSessionClient(uri, username=..., password=..., request_timeout_seconds=30)</code>.
- The request timeout applies to one HTTP request and defaults to 30 seconds.

**Open a session**

- Java: <code>openSession()</code> or <code>openSession(configs)</code>.
- Python: <code>open_session(configs=None)</code>.
- Reuse the session; set <code>kyuubi.session.engine.type=SPARK_SQL</code> for SparkSQL.

### Execute SQL and query operations

**Submit one SQL statement**

- Java: <code>executeSql(session, sql)</code> waits up to 300 seconds by default; <code>executeSql(session, sql, syncWaitTimeoutSeconds)</code> overrides the window per call.
- Python: <code>execute_sql(session, sql, sync_wait_timeout_seconds=300)</code>.
- Each call submits exactly one SQL statement.

**Read operation status**

- Java: <code>getOperationStatus(handle)</code>.
- Python: <code>get_operation_status(handle)</code>.
- Read the latest state reported by Kyuubi; this does not fetch result rows.

**Continue waiting and read the result**

- Java: <code>getResult(handle)</code> waits up to 300 seconds by default; <code>getResult(handle, syncWaitTimeoutSeconds)</code> overrides the window.
- Python: <code>get_result(handle, sync_wait_timeout_seconds=300)</code>.
- Returns COMPLETED, PENDING, or FAILED. Keep the handle and query again if the result is still PENDING.

### Release resources

**Close an operation**

- Java: <code>closeOperation(handle)</code>.
- Python: <code>close_operation(handle)</code>.
- Release it after the operation is terminal and its result is no longer needed.

**Close a session**

- Java: <code>closeSession(session)</code>.
- Python: <code>close_session(session)</code>.
- Close after all SQL and follow-up queries are complete.

The client wait window controls how long the SDK waits; it is not Kyuubi's SQL execution limit. The SDK does not send <code>kyuubi.operation.query.timeout</code> in the SQL request and does not cancel SQL when its own wait window expires. The server configuration determines whether SQL has an execution limit. If the server timeout cancels SQL, the SDK returns FAILED with the server state and available diagnostic.

## Open a session and submit one statement

The Java facade is a synchronous wrapper around the Scala client. The Python API is synchronous as well. The snippets use Java getters and Python attributes to inspect results.

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

COMPLETED means the statement succeeded. Read query results through <code>columns</code> and <code>rows</code> (Java: <code>getColumns()</code> and <code>getRows()</code>). FAILED is a terminal failure, cancellation, close, or server timeout reported by Kyuubi; inspect <code>status.diagnostic</code> when available. PENDING means the client wait window expired or result fetching is not finished. It is not a failure and does not cancel the operation.

## Save a handle and resume later

When the program prints a PENDING line, <code>operation_id</code> identifies the operation. Resuming also requires the <code>session_id</code> and <code>kyuubi_instance</code> from that line. These values do not include credentials, but they work only while Kyuubi still retains the session and operation. The SDK does not keep a durable task registry across Kyuubi restarts.

Copy the three values from the PENDING line into the environment and run resume mode in the same shell:

~~~bash
export UQ_KYUUBI_SESSION_ID='paste-session-id-here'
export UQ_KYUUBI_INSTANCE='paste-kyuubi-instance-here'
export UQ_KYUUBI_OPERATION_ID='paste-operation-id-here'

# Python: keep the virtual environment activated
python kyuubi-examples/kyuubi-python-example/kyuubi_sparksql.py --resume

# Java
mvn -q -f kyuubi-examples/kyuubi-java-example/pom.xml compile exec:java -Dexec.mainClass=com.example.KyuubiSqlSessionExample -Dexec.args=--resume
~~~

Both examples call <code>getOperationStatus</code> / <code>get_operation_status</code>, then <code>getResult</code> / <code>get_result</code> to wait and fetch the result. If it remains PENDING, the program prints the full handle again; do not close the session or operation. Close the operation only after COMPLETED or FAILED, and close the session after all SQL and follow-up queries are done. In a new shell, set KYUUBI_URI and the authentication variables again; reactivate the virtual environment before running Python.

## Run DROP, CREATE, INSERT, and SELECT in order

Each <code>executeSql</code> / <code>execute_sql</code> call submits one SQL statement. For dependent statements, the caller reuses the same session and waits for each statement to reach a successful terminal state before submitting the next. This is not an atomic batch and there is no cross-statement rollback. Stop after a failed statement and recover according to the resulting data state.

The helpers below call <code>getResult</code> / <code>get_result</code> again while an operation remains PENDING. They raise on FAILED and close each terminal operation. Each call uses a 300-second client wait window; an application can keep waiting or hand a handle to a later worker for a long-running query.

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

Save the Java program as `kyuubi-examples/kyuubi-java-example/src/main/java/com/example/KyuubiSequentialSqlExample.java` and the Python program as `kyuubi-examples/kyuubi-python-example/kyuubi_sparksql_sequence.py`. From the working directory used above, run:

~~~bash
# Java
mvn -q -f kyuubi-examples/kyuubi-java-example/pom.xml compile exec:java -Dexec.mainClass=com.example.KyuubiSequentialSqlExample

# Python: the virtual environment must be active
python kyuubi-examples/kyuubi-python-example/kyuubi_sparksql_sequence.py
~~~

This API accepts SQL strings and does not parameterize dynamic values. The example generates its table identifier from a fixed prefix and a UUID; validate any application input before using it as a SQL identifier.

## Result objects and lifecycle

| Object | Java accessors | Python attributes |
| --- | --- | --- |
| Session handle | <code>getSessionId()</code>, <code>getKyuubiInstance()</code> | <code>session_id</code>, <code>kyuubi_instance</code> |
| Operation handle | <code>getOperationId()</code>, <code>getSession()</code> | <code>operation_id</code>, <code>session</code> |
| Execution result | <code>getKind()</code>, <code>getHandle()</code>, <code>getStatus()</code>, <code>getColumns()</code>, <code>getRows()</code> | <code>kind</code>, <code>handle</code>, <code>status</code>, <code>columns</code>, <code>rows</code>; also <code>is_completed</code>, <code>is_pending</code>, <code>is_failed</code> |
| Operation status | <code>getState()</code>, <code>getStatement()</code>, <code>getDiagnostic()</code>, <code>getCreateTime()</code>, <code>getStartTime()</code>, <code>getCompleteTime()</code>, <code>isTerminal()</code>, <code>isSuccessful()</code> | <code>state</code>, <code>statement</code>, <code>diagnostic</code>, <code>create_time</code>, <code>start_time</code>, <code>complete_time</code>, <code>is_terminal</code>, <code>is_successful</code> |
| Result column | <code>getName()</code>, <code>getDataType()</code>, <code>getPosition()</code>, <code>getPrecision()</code>, <code>getScale()</code>, <code>getComment()</code> | <code>name</code>, <code>data_type</code>, <code>position</code>, <code>precision</code>, <code>scale</code>, <code>comment</code> |

The SDK materializes returned rows in client memory. Use SQL limits for large results. Kyuubi decides whether DDL/DML returns columns and rows; the SDK does not guarantee a generic affected-row count.

Session and operation lifetimes depend on Kyuubi idle timeouts, server cleanup, and instance availability. Save the Kyuubi instance route with the handle. The SDK does not maintain a durable task registry across server restarts. Do not close a pending operation or session if it must be queried later.

## Errors and limitations

- If SQL was accepted but a follow-up status or result request fails during <code>executeSql</code> / <code>execute_sql</code>, Java throws <code>KyuubiSqlOperationRequestException</code> and Python throws <code>KyuubiSqlOperationRequestError</code>; both carry the operation handle. Save it and check its state instead of blindly resubmitting SQL with side effects.
- If the wait window expires while the SDK is taking the pre-submit session-operations snapshot, the SQL has not been sent and no handle is returned; the SDK raises a transport error. An operation handle is available only after SQL is submitted or while the submission result is being reconciled.
- If the SQL submission response is lost and the SDK cannot uniquely identify the operation, it reports an unknown submission outcome. Do not replay automatically; verify the operation through Kyuubi administrative interfaces or server logs.
- <code>closeOperation</code> / <code>close_operation</code> releases an operation whose result is no longer needed. It is not a cancellation API for the client wait timeout. This SQL Session API does not expose SQL cancellation.
- The SQL Session API has no multi-statement batch, transaction atomicity, or rollback. Submit dependent statements one at a time and check each terminal state.
- A SQL Session operation handle differs from a Kyuubi Batch ID. This guide covers SQL Session operations only.
- The protocol baseline is Kyuubi 1.12.0. Check that the deployed version enables the API: [Kyuubi REST API v1](https://kyuubi.readthedocs.io/en/v1.12.0/client/rest/rest_api.html).
