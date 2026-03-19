declare module "pg" {
  export interface QueryResultRow {
    [column: string]: unknown;
  }

  export interface QueryResult<R = QueryResultRow> {
    rowCount: number | null;
    rows: R[];
  }

  export interface PoolClient {
    query<R = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<R>>;
    release(): void;
  }

  export interface PoolConfig {
    connectionString?: string;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
    on(event: "error", listener: (error: Error) => void): this;
    query<R = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<R>>;
  }
}
