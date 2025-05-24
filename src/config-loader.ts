import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConnectionConfig } from './types.js';
import { log } from '../utils/index.js';

const CONFIG_FILE_PATH = path.join(os.homedir(), '.mysql-mcp-connections.json');

export class ConfigLoader {
  static async loadConnections(): Promise<ConnectionConfig[]> {
    try {
      // Check if config file exists
      if (!fs.existsSync(CONFIG_FILE_PATH)) {
        log('info', `Config file not found at ${CONFIG_FILE_PATH}, creating empty config file`);
        await this.createEmptyConfigFile();
        return [];
      }

      // Read and parse config file
      const fileContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
      const connections = JSON.parse(fileContent) as ConnectionConfig[];

      // Validate the configuration
      this.validateConnections(connections);

      log('info', `Loaded ${connections.length} connection configurations`);
      return connections;
    } catch (error) {
      log('error', 'Error loading connection configurations:', error);
      throw new Error(`Failed to load connection configurations: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  static async createEmptyConfigFile(): Promise<void> {
    try {
      fs.writeFileSync(CONFIG_FILE_PATH, '[]', 'utf-8');
      log('info', `Created empty config file at ${CONFIG_FILE_PATH}`);
    } catch (error) {
      log('error', 'Error creating empty config file:', error);
      throw new Error(`Failed to create config file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  static validateConnections(connections: any[]): void {
    if (!Array.isArray(connections)) {
      throw new Error('Configuration must be an array');
    }

    for (let i = 0; i < connections.length; i++) {
      const conn = connections[i];
      
      if (!conn || typeof conn !== 'object') {
        throw new Error(`Connection at index ${i} is not a valid object`);
      }

      const requiredFields = ['id', 'host', 'port', 'user', 'password', 'name'];
      for (const field of requiredFields) {
        if (!(field in conn)) {
          throw new Error(`Connection at index ${i} is missing required field: ${field}`);
        }
      }

      if (typeof conn.id !== 'string' || conn.id.trim() === '') {
        throw new Error(`Connection at index ${i} has invalid id`);
      }

      if (typeof conn.host !== 'string' || conn.host.trim() === '') {
        throw new Error(`Connection at index ${i} has invalid host`);
      }

      if (typeof conn.port !== 'number' || conn.port <= 0) {
        throw new Error(`Connection at index ${i} has invalid port`);
      }

      if (typeof conn.user !== 'string') {
        throw new Error(`Connection at index ${i} has invalid user`);
      }

      if (typeof conn.password !== 'string') {
        throw new Error(`Connection at index ${i} has invalid password`);
      }

      if (typeof conn.name !== 'string' || conn.name.trim() === '') {
        throw new Error(`Connection at index ${i} has invalid database name`);
      }
    }

    // Check for duplicate IDs
    const ids = connections.map(conn => conn.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      throw new Error('Duplicate connection IDs found in configuration');
    }
  }

  static getConfigFilePath(): string {
    return CONFIG_FILE_PATH;
  }
}
