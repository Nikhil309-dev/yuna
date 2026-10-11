export class TTLCache {
    public ttlMs: number;
    public maxSize: number;
    public cache: Map<string, { value: any, expires: number }>;

    constructor(ttlMs: number = 60000, maxSize: number = 1000) {
        this.ttlMs = ttlMs;
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    set(key: string, value: any, customTtl: number = this.ttlMs) {

        if (!this.cache.has(key) && this.cache.size >= this.maxSize) {

            const now = Date.now();
            for (const [k, item] of this.cache) {
                if (now > item.expires) this.cache.delete(k);
            }

            if (this.cache.size >= this.maxSize) {
                const firstKey = this.cache.keys().next().value;
                if (firstKey !== undefined) this.cache.delete(firstKey);
            }
        }

        this.cache.set(key, {
            value,
            expires: Date.now() + customTtl
        });
    }

    get(key: string): any | undefined {
        const item = this.cache.get(key);
        if (!item) return undefined;

        if (Date.now() > item.expires) {
            this.cache.delete(key);
            return undefined;
        }

        return item.value;
    }

    has(key: string): boolean {
        return this.get(key) !== undefined;
    }

    delete(key: string): boolean {
        return this.cache.delete(key);
    }

    clear(): void {
        this.cache.clear();
    }

    get size(): number {
        return this.cache.size;
    }

    *entries(): Generator<[string, any], void, undefined> {
        for (const [key, item] of this.cache.entries()) {
            if (Date.now() <= item.expires) {
                yield [key, item.value];
            } else {
                this.cache.delete(key);
            }
        }
    }
}

// Made by Nikhil Under CodeX Devs
