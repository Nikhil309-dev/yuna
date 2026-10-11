declare module 'better-sqlite3' {
	class Database {
		constructor(path: string, options?: Database.Options);
		prepare(source: string): Database.Statement;

		exec(source: string): Database;
		pragma(source: string, options?: { simple?: boolean }): any;
		transaction(fn: (...args: any[]) => any): Database.Transaction;
		backup(destination: string, options?: { attached?: string }): Promise<void>;
		close(): void;
		open: boolean;
		inTransaction: boolean;
	}

	namespace Database {

		type Database = InstanceType<typeof Database>;

		interface RunResult {
			changes: number;
			lastInsertRowid: number | bigint;
		}

		class Statement {
			get(...params: any[]): any;
			all(...params: any[]): any[];
			run(...params: any[]): RunResult;
			iterate(...params: any[]): IterableIterator<any>;
			raw(switchValue?: boolean): Statement;
			expand(switchValue?: boolean): Statement;
			pluck(switchValue?: boolean): Statement;
			source(): string;
		}

		interface Transaction {
			(...args: any[]): any;
			defer(): Transaction;
			immediate(): Transaction;
			exclusive(): Transaction;
		}

		interface Options {
			readonly?: boolean | undefined;
			fileMustExist?: boolean | undefined;
			timeout?: number | undefined;
			verbose?: ((message?: unknown) => void) | null | undefined;
			nativeBinding?: string | undefined;
			enableForeignKeyConstraints?: boolean | undefined;
		}
	}

	export = Database;
}

// Made by Nikhil Under CodeX Devs
