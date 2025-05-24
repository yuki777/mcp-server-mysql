# 技術コンテキスト

## 技術スタック

### コア技術
- **ランタイム**: Node.js v18+（.nvmrcとpackage.jsonで指定）
- **言語**: TypeScript 5.8.2 with ESモジュール
- **プロトコル**: Model Context Protocol (MCP) 1.8.0
- **データベース**: MySQL 5.7+（MySQL 8.0+推奨）

### 主要依存関係

#### 本番依存関係
```json
{
  "@modelcontextprotocol/sdk": "1.8.0",  // MCPプロトコル実装
  "dotenv": "^16.4.7",                   // 環境設定
  "mcp-evals": "^1.0.18",               // MCP評価フレームワーク
  "mysql2": "^3.14.0",                  // Promise対応MySQLクライアント
  "node-sql-parser": "^5.3.8"           // SQL解析と検証
}
```

#### 開発依存関係
```json
{
  "@types/node": "^20.17.28",           // Node.js型定義
  "typescript": "^5.8.2",               // TypeScriptコンパイラー
  "vitest": "^1.6.1",                   // テストフレームワーク
  "ts-node": "^10.9.2",                 // TypeScript実行
  "eslint": "^8.57.1",                  // コードリンティング
  "shx": "^0.3.4"                       // クロスプラットフォームシェルコマンド
}
```

## 開発環境セットアップ

### 前提条件
1. **Node.js**: バージョン18以上
2. **MySQLサーバー**: バージョン5.7+（8.0+推奨）
3. **パッケージマネージャー**: npmまたはpnpm
4. **データベースアクセス**: 適切な権限を持つMySQLユーザー

### 環境設定

#### 必須環境変数
```env
# データベース接続
MYSQL_HOST=127.0.0.1          # MySQLサーバーホスト
MYSQL_PORT=3306               # MySQLサーバーポート
MYSQL_USER=root               # MySQLユーザー名
MYSQL_PASS=your_password      # MySQLパスワード
MYSQL_DB=your_database        # 対象データベース（マルチDBモードでは空）

# セキュリティ設定
ALLOW_INSERT_OPERATION=false  # INSERT操作を有効化
ALLOW_UPDATE_OPERATION=false  # UPDATE操作を有効化
ALLOW_DELETE_OPERATION=false  # DELETE操作を有効化
ALLOW_DDL_OPERATION=false     # DDL操作を有効化

# スキーマ固有権限（オプション）
SCHEMA_INSERT_PERMISSIONS=dev:true,test:true,prod:false
SCHEMA_UPDATE_PERMISSIONS=dev:true,test:true,prod:false
SCHEMA_DELETE_PERMISSIONS=dev:false,test:true,prod:false
SCHEMA_DDL_PERMISSIONS=dev:false,test:true,prod:false
```

#### オプション設定
```env
# パフォーマンス設定
MYSQL_POOL_SIZE=10            # コネクションプールサイズ
MYSQL_QUERY_TIMEOUT=30000     # クエリタイムアウト（ミリ秒）
MYSQL_CACHE_TTL=60000         # キャッシュTTL（ミリ秒）

# セキュリティ設定
MYSQL_SSL=true                # SSL/TLS有効化
MYSQL_RATE_LIMIT=100          # 分間クエリ数
MYSQL_MAX_QUERY_COMPLEXITY=1000

# 監視
MYSQL_ENABLE_LOGGING=false    # クエリログ有効化
MYSQL_LOG_LEVEL=info          # ログレベル
MYSQL_METRICS_ENABLED=false   # メトリクス有効化

# マルチDBモード
MULTI_DB_WRITE_MODE=false     # マルチDBモードで書き込み有効化
```

### ビルドシステム

#### TypeScript設定（`tsconfig.json`）
- **ターゲット**: Node.js互換ESモジュール
- **モジュール**: ES2022モジュールシステム
- **出力**: 実行権限付き`dist/`ディレクトリ
- **型チェック**: 厳密モード有効

#### スクリプト
```json
{
  "start": "node dist/index.js",              // ビルド済みサーバー実行
  "dev": "ts-node index.ts",                  // 開発サーバー
  "build": "tsc && shx chmod +x dist/*.js",   // 権限付きビルド
  "watch": "tsc --watch",                     // 開発ビルド
  "test": "pnpm run setup:test:db && vitest run",  // 完全テストスイート
  "setup:test:db": "node --loader ts-node/esm scripts/setup-test-db.ts"
}
```

## インストール方法

### 1. NPMグローバルインストール
```bash
npm install -g @benborla29/mcp-server-mysql
```

### 2. Smithery（推奨）
```bash
npx -y @smithery/cli@latest install @benborla29/mcp-server-mysql --client claude
```

### 3. MCP Get
```bash
npx @michaellatman/mcp-get@latest install @benborla29/mcp-server-mysql
```

### 4. ローカル開発
```bash
git clone https://github.com/benborla/mcp-server-mysql.git
cd mcp-server-mysql
pnpm install
pnpm run build
```

## 統合設定

### Claude Desktop設定
```json
{
  "mcpServers": {
    "mcp_server_mysql": {
      "command": "npx",
      "args": ["-y", "@benborla29/mcp-server-mysql"],
      "env": {
        "MYSQL_HOST": "127.0.0.1",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "root",
        "MYSQL_PASS": "your_password",
        "MYSQL_DB": "your_database",
        "PATH": "/path/to/node/bin:/usr/bin:/bin",
        "NODE_PATH": "/path/to/node_modules"
      }
    }
  }
}
```

### Cursor IDE設定
```json
{
  "mcpServers": {
    "MySQL": {
      "command": "npx",
      "args": [
        "mcprunner", "--",
        "MYSQL_HOST=127.0.0.1",
        "MYSQL_PORT=3306", 
        "MYSQL_USER=root",
        "MYSQL_PASS=root",
        "MYSQL_DB=demostore",
        "--",
        "npx", "-y", "@benborla29/mcp-server-mysql"
      ]
    }
  }
}
```

## テストインフラ

### テストデータベースセットアップ
```sql
-- テストデータベースとユーザー作成
CREATE DATABASE IF NOT EXISTS mcp_test;
CREATE USER IF NOT EXISTS 'mcp_test'@'localhost' IDENTIFIED BY 'mcp_test_password';
GRANT ALL PRIVILEGES ON mcp_test.* TO 'mcp_test'@'localhost';
FLUSH PRIVILEGES;
```

### テストカテゴリ
1. **単体テスト**: コア機能テスト
2. **統合テスト**: データベース相互作用テスト
3. **E2Eテスト**: 完全サーバーワークフローテスト
4. **マルチDBテスト**: マルチデータベースモードテスト
5. **スキーマ権限テスト**: 権限システムテスト

### テストコマンド
```bash
pnpm test              # 全テスト実行
pnpm test:unit         # 単体テストのみ
pnpm test:integration  # 統合テストのみ
pnpm test:e2e          # E2Eテストのみ
pnpm test:watch        # ウォッチモード
pnpm test:coverage     # カバレッジレポート
```

## 展開考慮事項

### 本番要件
- Node.js 18+ランタイム
- MySQL 5.7+データベースサーバー
- 適切な環境変数設定
- データベース接続のSSL/TLS暗号化
- 適切なMySQLユーザー権限

### セキュリティチェックリスト
- [ ] デフォルトで読み取り専用モード有効
- [ ] 書き込み操作を明示的に設定
- [ ] スキーマ固有権限設定
- [ ] データベース接続でSSL/TLS有効
- [ ] レート制限設定
- [ ] クエリ複雑度制限設定
- [ ] 監視用ログ有効

### パフォーマンス最適化
- コネクションプーリング設定（デフォルト：10接続）
- クエリタイムアウト適切設定
- 必要に応じて結果キャッシュ有効
- リソース監視配置

## トラブルシューティング

### よくある問題
1. **パス解決**: 明示的なPATHとNODE_PATH設定
2. **認証**: MySQL 8.0+認証プラグイン互換性
3. **SSL設定**: 証明書検証設定
4. **権限エラー**: MySQLユーザー権限確認

### デバッグコマンド
```bash
# Node.jsパステスト
which node
echo "$(which node)/../"
echo "$(which node)/../../lib/node_modules"

# MySQL接続テスト
mysql -h 127.0.0.1 -u root -p your_database

# サーバー直接テスト
node dist/index.js --stdio
