# システムパターン

## アーキテクチャ概要
MCP Server MySQLは**階層アーキテクチャ**に従い、明確な関心の分離を実現：
- **トランスポート層**: MCPプロトコル通信（stdio）
- **サービス層**: クエリ実行と権限管理
- **データ層**: MySQL接続管理とプーリング
- **セキュリティ層**: クエリ検証とトランザクション制御

## 主要設計パターン

### 1. 遅延読み込みパターン
**目的**: 高コストなリソース生成を実際に必要になるまで延期

```typescript
// MySQL プール遅延読み込み
let poolPromise: Promise<mysql2.Pool>
const getPool = (): Promise<mysql2.Pool> => {
  if (!poolPromise) {
    poolPromise = new Promise<mysql2.Pool>((resolve, reject) => {
      // プール作成ロジック
    })
  }
  return poolPromise
}

// サーバーインスタンス遅延読み込み
let serverInstance: Promise<Server> | null = null
const getServer = (): Promise<Server> => {
  if (!serverInstance) {
    serverInstance = new Promise<Server>((resolve) => {
      // サーバー設定ロジック
    })
  }
  return serverInstance
}
```

**メリット**: 
- 高速起動時間
- リソース節約
- 初期化中のエラー分離

### 2. ファクトリーパターン
**目的**: 適切な設定を持つ複雑なオブジェクトの一元的作成

```typescript
// 設定ファクトリー
const config = {
  server: { name, version, connectionTypes },
  mysql: { host, port, user, password, database, ssl },
  paths: { schema }
}
```

### 3. ストラテジーパターン
**目的**: クエリタイプと権限に基づく異なる実行戦略

```typescript
// クエリ実行戦略
async function executeReadOnlyQuery<T>(sql: string): Promise<T>
async function executeWriteQuery<T>(sql: string): Promise<T>

// スキーマ毎の権限戦略
function isInsertAllowedForSchema(schema: string | null): boolean
function isUpdateAllowedForSchema(schema: string | null): boolean
function isDeleteAllowedForSchema(schema: string | null): boolean
function isDDLAllowedForSchema(schema: string | null): boolean
```

### 4. トランザクションパターン
**目的**: データ整合性の確保とロールバック機能の提供

```typescript
// 読み取り専用トランザクションパターン
await connection.query('SET SESSION TRANSACTION READ ONLY')
await connection.beginTransaction()
try {
  const result = await connection.query(sql)
  await connection.rollback() // 読み取り専用では常にロールバック
} catch (error) {
  await connection.rollback()
  throw error
}

// 書き込みトランザクションパターン
await connection.beginTransaction()
try {
  const result = await connection.query(sql)
  await connection.commit()
} catch (error) {
  await connection.rollback()
  throw error
}
```

### 5. リソース管理パターン
**目的**: データベース接続の適切なライフサイクル管理

```typescript
// 接続ライフサイクル管理
let connection
try {
  const pool = await getPool()
  connection = await pool.getConnection()
  // 接続使用
} finally {
  if (connection) {
    connection.release() // 常に開放
  }
}
```

### 6. 設定パターン
**目的**: 環境ベースの設定と合理的なデフォルト値

```typescript
// 環境設定
const ALLOW_INSERT_OPERATION = process.env.ALLOW_INSERT_OPERATION === 'true'
const SCHEMA_INSERT_PERMISSIONS: SchemaPermissions = parseSchemaPermissions(...)

// マルチモード検出
const isMultiDbMode = !process.env.MYSQL_DB || process.env.MYSQL_DB.trim() === ''
```

### 7. パーサー戦略パターン
**目的**: SQLクエリ分析と検証

```typescript
const parser = new Parser();
async function getQueryTypes(query: string): Promise<string[]> {
  const astOrArray: AST | AST[] = parser.astify(query, { database: 'mysql' });
  const statements = Array.isArray(astOrArray) ? astOrArray : [astOrArray];
  return statements.map(stmt => stmt.type?.toLowerCase() ?? 'unknown');
}
```

### 8. 権限マトリックスパターン
**目的**: スキーマ固有のオーバーライドを含むきめ細かいアクセス制御

```typescript
// グローバルデフォルト + スキーマオーバーライド
const globalPermissions = {
  insert: ALLOW_INSERT_OPERATION,
  update: ALLOW_UPDATE_OPERATION,
  delete: ALLOW_DELETE_OPERATION,
  ddl: ALLOW_DDL_OPERATION
}

const schemaPermissions = {
  insert: SCHEMA_INSERT_PERMISSIONS,
  update: SCHEMA_UPDATE_PERMISSIONS,
  delete: SCHEMA_DELETE_PERMISSIONS,
  ddl: SCHEMA_DDL_PERMISSIONS
}
```

## エラーハンドリングアーキテクチャ

### 1. 階層化エラーハンドリング
- **トランスポートレベル**: MCPプロトコルエラー
- **サービスレベル**: クエリ検証と権限エラー
- **データレベル**: データベース接続とクエリエラー
- **システムレベル**: プロセスレベルエラーハンドリング

### 2. 優雅な劣化
```typescript
// 安全な終了パターン（テスト対応）
function safeExit(code: number): void {
  if (!isTestEnvironment) {
    process.exit(code)
  } else {
    log('error', `[Test mode] Would have called process.exit(${code})`)
  }
}
```

### 3. 包括的エラーログ
```typescript
// 構造化エラーログ
log('error', 'Error context', errorDetails)
```

## セキュリティパターン

### 1. 多層防御
- クエリ解析と検証
- トランザクションレベル分離
- 権限ベースアクセス制御
- スキーマ固有制限

### 2. デフォルトで安全
- デフォルトで読み取り専用トランザクション
- 書き込み操作は明示的設定が必要
- マルチDBモードは明示的有効化なしで読み取り専用を強制

### 3. 最小権限の原則
- スキーマ固有権限がグローバル設定をオーバーライド
- きめ細かい操作制御（INSERT、UPDATE、DELETE、DDL）

## マルチデータベースアーキテクチャ

### 1. モード検出
```typescript
const isMultiDbMode = !process.env.MYSQL_DB || process.env.MYSQL_DB.trim() === ''
```

### 2. スキーマ抽出
```typescript
function extractSchemaFromQuery(sql: string): string | null {
  // USE文検出
  // database.table記法解析
  // デフォルトスキーマフォールバック
}
```

### 3. リソースURIパターン
```typescript
// シングルDB: table_name/schema
// マルチDB: database_name/table_name/schema
```

このアーキテクチャは**スケーラビリティ**、**セキュリティ**、**保守性**を確保しながら、柔軟なデータベースアクセスパターンを提供します。
