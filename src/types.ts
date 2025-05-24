export interface ConnectionConfig {
  id: string;
  host: string;
  port: number;
  user: string;
  password: string;
  name: string; // database name
}


export interface TableRow {
  table_name: string;
}

export interface ColumnRow {
  column_name: string;
  data_type: string;
}
