import * as mysql2 from 'mysql2/promise';
import { ConnectionConfig } from './types.js';
import { ConfigLoader } from './config-loader.js';
import { log } from '../utils/index.js';

export class ConnectionManager {
  private static instance: ConnectionManager | null = null;
  private connections: Map<string, mysql2.Pool> = new Map();
  private activeConnectionId: string | null = null;
  private configs: ConnectionConfig[] = [];

  private constructor() {}

  static async getInstance(): Promise<ConnectionManager> {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
      await ConnectionManager.instance.initialize();
    }
    return ConnectionManager.instance;
  }

  private async initialize(): Promise<void> {
    try {
      this.configs = await ConfigLoader.loadConnections();
      log('info', `ConnectionManager initialized with ${this.configs.length} connection configurations`);
    } catch (error) {
      log('error', 'Failed to initialize ConnectionManager:', error);
      throw error;
    }
  }

  async getAvailableConnections(): Promise<ConnectionConfig[]> {
    return [...this.configs];
  }

  async connectToDatabase(connectionId: string) {
    const config = this.configs.find(c => c.id === connectionId);
    if (!config) {
      throw new Error(`Connection configuration not found for ID: ${connectionId}`);
    }

    try {
      // Check if connection already exists
      if (this.connections.has(connectionId)) {
        this.activeConnectionId = connectionId;
        log('info', `Switched to existing connection: ${connectionId}`);
        return {
          content: [{
            type: 'text',
            text: `Successfully switched to existing connection: ${connectionId} (${config.host}:${config.port}/${config.name})`
          }]
        };
      }

      // Create new connection pool
      const poolConfig = {
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.name,
        connectionLimit: 10,
        authPlugins: {
          mysql_clear_password: () => () => Buffer.from(config.password),
        }
      };

      const pool = mysql2.createPool(poolConfig);
      
      // Test the connection
      const connection = await pool.getConnection();
      await connection.ping();
      connection.release();

      // Store the connection
      this.connections.set(connectionId, pool);
      this.activeConnectionId = connectionId;

      log('info', `Successfully connected to database: ${connectionId}`);
      return {
        content: [{
          type: 'text',
          text: `Successfully connected to: ${connectionId} (${config.host}:${config.port}/${config.name})`
        }]
      };
    } catch (error) {
      log('error', `Failed to connect to database ${connectionId}:`, error);
      throw new Error(`Failed to connect to database ${connectionId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getCurrentConnection() {
    if (!this.activeConnectionId) {
      return {
        content: [{
          type: 'text',
          text: 'No active database connection. Use connect_to_database to establish a connection.'
        }]
      };
    }

    const config = this.configs.find(c => c.id === this.activeConnectionId);
    if (!config) {
      throw new Error('Active connection configuration not found.');
    }

    return {
      content: [{
        type: 'text',
        text: `Current active connection: ${this.activeConnectionId} (${config.host}:${config.port}/${config.name})`
      }]
    };
  }

  async disconnect() {
    if (!this.activeConnectionId) {
      return {
        content: [{
          type: 'text',
          text: 'No active connection to disconnect.'
        }]
      };
    }

    try {
      const pool = this.connections.get(this.activeConnectionId);
      if (pool) {
        await pool.end();
        this.connections.delete(this.activeConnectionId);
      }

      const disconnectedId = this.activeConnectionId;
      this.activeConnectionId = null;

      log('info', `Disconnected from database: ${disconnectedId}`);
      return {
        content: [{
          type: 'text',
          text: `Successfully disconnected from: ${disconnectedId}`
        }]
      };
    } catch (error) {
      log('error', 'Failed to disconnect:', error);
      throw new Error(`Failed to disconnect: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getActivePool(): Promise<mysql2.Pool | null> {
    if (!this.activeConnectionId) {
      return null;
    }
    return this.connections.get(this.activeConnectionId) || null;
  }

  getActiveConnectionId(): string | null {
    return this.activeConnectionId;
  }

  async closeAllConnections(): Promise<void> {
    for (const [id, pool] of this.connections) {
      try {
        await pool.end();
        log('info', `Closed connection: ${id}`);
      } catch (error) {
        log('error', `Error closing connection ${id}:`, error);
      }
    }
    this.connections.clear();
    this.activeConnectionId = null;
  }
}
