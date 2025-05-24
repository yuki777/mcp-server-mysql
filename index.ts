#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as mysql2 from "mysql2/promise";
import SqlParser, { AST } from 'node-sql-parser';
import { log } from './utils/index.js';
import { ConnectionManager } from './src/connection-manager.js';
import { ConnectionConfig, TableRow, ColumnRow } from './src/types.js';

// Check if running in test mode
const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.VITEST;

// Safe way to exit process (not during tests)
function safeExit(code: number): void {
  if (!isTestEnvironment) {
    process.exit(code);
  } else {
    log('error', `[Test mode] Would have called process.exit(${code})`);
  }
}

log('info', 'Starting MCP server with connection manager...');

const config = {
  server: {
    name: '@benborla29/mcp-server-mysql',
    version: '2.0.0',
    connectionTypes: ['stdio'],
  },
  paths: {
    schema: 'schema',
  },
};

// Lazy load server instance
let serverInstance: Promise<Server> | null = null;
const getServer = (): Promise<Server> => {
  if (!serverInstance) {
    serverInstance = new Promise<Server>((resolve) => {
      const server = new Server(config.server, {
        capabilities: {
          resources: {},
          tools: {
            list_connections: {
              description: 'List all available database connections',
              inputSchema: {
                type: 'object',
                properties: {},
                required: [],
              },
            },
            connect_to_database: {
              description: 'Connect to a specific database by connection ID',
              inputSchema: {
                type: 'object',
                properties: {
                  connection_id: {
                    type: 'string',
                    description: 'The ID of the database connection to connect to',
                  },
                },
                required: ['connection_id'],
              },
            },
            get_current_connection: {
              description: 'Get information about the current active database connection',
              inputSchema: {
                type: 'object',
                properties: {},
                required: [],
              },
            },
            disconnect: {
              description: 'Disconnect from the current active database connection',
              inputSchema: {
                type: 'object',
                properties: {},
                required: [],
              },
            },
            mysql_query: {
              description: 'Execute SQL query on the currently active database connection',
              inputSchema: {
                type: 'object',
                properties: {
                  sql: {
                    type: 'string',
                    description: 'The SQL query to execute',
                  },
                },
                required: ['sql'],
              },
            },
          },
        },
      });

      // Register request handlers
      server.setRequestHandler(
        ListResourcesRequestSchema,
        async () => {
          try {
            log('info', 'Handling ListResourcesRequest');
            
            const connectionManager = await ConnectionManager.getInstance();
            const activePool = await connectionManager.getActivePool();
            
            if (!activePool) {
              return {
                resources: [],
              };
            }

            // Get tables from the currently active database
            const connection = await activePool.getConnection();
            try {
              const [results] = await connection.query(
                'SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()'
              );
              const tables = results as TableRow[];

              return {
                resources: tables.map((row: TableRow) => ({
                  uri: new URL(
                    `${row.table_name}/${config.paths.schema}`,
                    `mysql://active-connection/`,
                  ).href,
                  mimeType: 'application/json',
                  name: `"${row.table_name}" database schema`,
                })),
              };
            } finally {
              connection.release();
            }
          } catch (error) {
            log('error', 'Error in ListResourcesRequest handler:', error);
            throw error;
          }
        },
      );

      server.setRequestHandler(
        ReadResourceRequestSchema,
        async (request) => {
          try {
            log('info', 'Handling ReadResourceRequest');
            
            const connectionManager = await ConnectionManager.getInstance();
            const activePool = await connectionManager.getActivePool();
            
            if (!activePool) {
              throw new Error('No active database connection. Please connect to a database first.');
            }

            const resourceUrl = new URL(request.params.uri);
            const pathComponents = resourceUrl.pathname.split('/');
            const schema = pathComponents.pop();
            const tableName = pathComponents.pop();

            if (schema !== config.paths.schema) {
              throw new Error('Invalid resource URI');
            }

            const connection = await activePool.getConnection();
            try {
              const [results] = await connection.query(
                'SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ? AND table_schema = DATABASE()',
                [tableName]
              );
              const columns = results as ColumnRow[];

              return {
                contents: [
                  {
                    uri: request.params.uri,
                    mimeType: 'application/json',
                    text: JSON.stringify(columns, null, 2),
                  },
                ],
              };
            } finally {
              connection.release();
            }
          } catch (error) {
            log('error', 'Error in ReadResourceRequest handler:', error);
            throw error;
          }
        },
      );

      server.setRequestHandler(ListToolsRequestSchema, async () => {
        log('info', 'Handling ListToolsRequest');
        
        const toolsResponse = {
          tools: [
            {
              name: 'list_connections',
              description: 'List all available database connections',
              inputSchema: {
                type: 'object',
                properties: {},
                required: [],
              },
            },
            {
              name: 'connect_to_database',
              description: 'Connect to a specific database by connection ID',
              inputSchema: {
                type: 'object',
                properties: {
                  connection_id: {
                    type: 'string',
                    description: 'The ID of the database connection to connect to',
                  },
                },
                required: ['connection_id'],
              },
            },
            {
              name: 'get_current_connection',
              description: 'Get information about the current active database connection',
              inputSchema: {
                type: 'object',
                properties: {},
                required: [],
              },
            },
            {
              name: 'disconnect',
              description: 'Disconnect from the current active database connection',
              inputSchema: {
                type: 'object',
                properties: {},
                required: [],
              },
            },
            {
              name: 'mysql_query',
              description: 'Execute SQL query on the currently active database connection',
              inputSchema: {
                type: 'object',
                properties: {
                  sql: {
                    type: 'string',
                    description: 'The SQL query to execute',
                  },
                },
                required: ['sql'],
              },
            },
          ],
        };
        
        return toolsResponse;
      });

      server.setRequestHandler(
        CallToolRequestSchema,
        async (request) => {
          try {
            log('info', 'Handling CallToolRequest:', request.params.name);
            const connectionManager = await ConnectionManager.getInstance();

            switch (request.params.name) {
              case 'list_connections':
                return await handleListConnections(connectionManager);
              
              case 'connect_to_database':
                const connectionId = request.params.arguments?.connection_id as string;
                if (!connectionId) {
                  throw new Error('connection_id is required');
                }
                return await connectionManager.connectToDatabase(connectionId);
              
              case 'get_current_connection':
                return await connectionManager.getCurrentConnection();
              
              case 'disconnect':
                return await connectionManager.disconnect();
              
              case 'mysql_query':
                const sql = request.params.arguments?.sql as string;
                if (!sql) {
                  throw new Error('sql is required');
                }
                return await executeQuery(connectionManager, sql);
              
              default:
                throw new Error(`Unknown tool: ${request.params.name}`);
            }
          } catch (error) {
            log('error', 'Error in CallToolRequest handler:', error);
            throw error;
          }
        },
      );

      resolve(server);
    });
  }
  return serverInstance;
};

async function handleListConnections(connectionManager: ConnectionManager) {
  const connections = await connectionManager.getAvailableConnections();
  
  if (connections.length === 0) {
    return {
      content: [{
        type: 'text',
        text: 'No database connections configured. Please add connection configurations to ~/.mysql-mcp-connections.json'
      }]
    };
  }

  const connectionsText = connections.map(conn => 
    `- ${conn.id}: ${conn.host}:${conn.port}/${conn.name} (user: ${conn.user})`
  ).join('\n');

  return {
    content: [{
      type: 'text',
      text: `Available database connections:\n${connectionsText}`
    }]
  };
}

const { Parser } = SqlParser;
const parser = new Parser();

async function getQueryTypes(query: string): Promise<string[]> {
  try {
    log('info', "Parsing SQL query: ", query);
    const astOrArray: AST | AST[] = parser.astify(query, { database: 'mysql' });
    const statements = Array.isArray(astOrArray) ? astOrArray : [astOrArray];

    log('info', "Parsed SQL AST: ", statements.map(stmt => stmt.type?.toLowerCase() ?? 'unknown'));
    
    return statements.map(stmt => stmt.type?.toLowerCase() ?? 'unknown');
  } catch (err: any) {
    log('error', "sqlParser error, query: ", query);
    log('error', 'Error parsing SQL query:', err);
    throw new Error(`Parsing failed: ${err.message}`);
  }
}

async function executeQuery(connectionManager: ConnectionManager, sql: string) {
  const activePool = await connectionManager.getActivePool();
  
  if (!activePool) {
    throw new Error('No active database connection. Please connect to a database first using connect_to_database.');
  }

  let connection;
  try {
    // Check the type of query
    const queryTypes = await getQueryTypes(sql);
    
    const isUpdateOperation = queryTypes.some(type => ['update'].includes(type)); 
    const isInsertOperation = queryTypes.some(type => ['insert'].includes(type)); 
    const isDeleteOperation = queryTypes.some(type => ['delete'].includes(type));
    const isDDLOperation = queryTypes.some(type => 
      ['create', 'alter', 'drop', 'truncate'].includes(type));
    
    const isWriteOperation = isInsertOperation || isUpdateOperation || isDeleteOperation || isDDLOperation;

    connection = await activePool.getConnection();
    log('info', 'Database connection acquired for query');

    if (isWriteOperation) {
      // Handle write operations
      await connection.beginTransaction();

      try {
        const [result] = await connection.query(sql);
        await connection.commit();
        
        let responseText;
        if (isInsertOperation) {
          const resultHeader = result as mysql2.ResultSetHeader;
          responseText = `Insert successful. Affected rows: ${resultHeader.affectedRows}, Last insert ID: ${resultHeader.insertId}`;
        } else if (isUpdateOperation) {
          const resultHeader = result as mysql2.ResultSetHeader;
          responseText = `Update successful. Affected rows: ${resultHeader.affectedRows}, Changed rows: ${resultHeader.changedRows || 0}`;
        } else if (isDeleteOperation) {
          const resultHeader = result as mysql2.ResultSetHeader;
          responseText = `Delete successful. Affected rows: ${resultHeader.affectedRows}`;
        } else if (isDDLOperation) {
          responseText = `DDL operation successful.`;
        } else {
          responseText = JSON.stringify(result, null, 2);
        }

        return {
          content: [{
            type: 'text',
            text: responseText,
          }]
        };
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    } else {
      // Handle read operations with read-only transaction
      await connection.query('SET SESSION TRANSACTION READ ONLY');
      await connection.beginTransaction();

      try {
        const [result] = await connection.query(sql);
        await connection.rollback();
        await connection.query('SET SESSION TRANSACTION READ WRITE');

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2),
          }]
        };
      } catch (error) {
        await connection.rollback();
        await connection.query('SET SESSION TRANSACTION READ WRITE');
        throw error;
      }
    }
  } catch (error) {
    log('error', 'Error executing query:', error);
    throw new Error(`Error executing query: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (connection) {
      connection.release();
      log('info', 'Database connection released');
    }
  }
}

// Server startup and shutdown
async function runServer(): Promise<void> {
  try {
    log('info', 'Initializing connection manager...');
    // Initialize connection manager (this will load configurations)
    await ConnectionManager.getInstance();
    
    const server = await getServer();
    const transport = new StdioServerTransport();
    log('info', 'Connecting server to transport...');
    await server.connect(transport);
    log('info', 'Server connected to transport successfully');
  } catch (error) {
    log('error', 'Fatal error during server startup:', error);
    safeExit(1);
  }
}

const shutdown = async (signal: string): Promise<void> => {
  log('info', `Received ${signal}. Shutting down...`);
  try {
    const connectionManager = await ConnectionManager.getInstance();
    await connectionManager.closeAllConnections();
    log('info', 'All database connections closed successfully');
  } catch (err) {
    log('error', 'Error closing connections:', err);
    throw err;
  }
};

process.on('SIGINT', async () => {
  try {
    await shutdown('SIGINT');
    process.exit(0);
  } catch (err) {
    log('error', 'Error during SIGINT shutdown:', err);
    safeExit(1);
  }
});

process.on('SIGTERM', async () => {
  try {
    await shutdown('SIGTERM');
    process.exit(0);
  } catch (err) {
    log('error', 'Error during SIGTERM shutdown:', err);
    safeExit(1);
  }
});

// Add unhandled error listeners
process.on('uncaughtException', (error) => {
  log('error', 'Uncaught exception:', error);
  safeExit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log('error', 'Unhandled rejection at:', promise, 'reason:', reason);
  safeExit(1);
});

runServer().catch((error: unknown) => {
  log('error', 'Server error:', error);
  safeExit(1);
});
