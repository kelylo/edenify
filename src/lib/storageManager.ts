/**
 * Storage Manager - Abstraction for localStorage
 * Provides consistent key prefixing, error handling, and type safety
 */

export class StorageManager {
  private prefix: string;

  /**
   * Initialize storage manager with optional prefix
   * @example new StorageManager("account-123")
   * All keys will be stored as "account-123:key-name"
   */
  constructor(prefix = '') {
    this.prefix = prefix;
  }

  /**
   * Get full key with prefix
   */
  private getKey(key: string): string {
    return this.prefix ? `${this.prefix}:${key}` : key;
  }

  /**
   * Get value from storage with type safety
   * @example const user = storage.get<User>("user", defaultUser)
   */
  get<T>(key: string, defaultValue?: T): T | undefined {
    try {
      const item = localStorage.getItem(this.getKey(key));
      if (item === null) return defaultValue;
      return JSON.parse(item) as T;
    } catch (err) {
      console.warn(`[StorageManager] Failed to get "${key}":`, err);
      return defaultValue;
    }
  }

  /**
   * Set value in storage
   */
  set<T>(key: string, value: T): boolean {
    try {
      localStorage.setItem(this.getKey(key), JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn(`[StorageManager] Failed to set "${key}":`, err);
      return false;
    }
  }

  /**
   * Check if key exists in storage
   */
  has(key: string): boolean {
    return localStorage.getItem(this.getKey(key)) !== null;
  }

  /**
   * Remove a specific key
   */
  remove(key: string): boolean {
    try {
      localStorage.removeItem(this.getKey(key));
      return true;
    } catch (err) {
      console.warn(`[StorageManager] Failed to remove "${key}":`, err);
      return false;
    }
  }

  /**
   * Clear all keys with this manager's prefix
   */
  clear(): boolean {
    try {
      const fullPrefix = this.prefix ? `${this.prefix}:` : '';
      const keysToDelete: string[] = [];

      // Collect all matching keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(fullPrefix)) {
          keysToDelete.push(key);
        }
      }

      // Delete collected keys
      keysToDelete.forEach(key => localStorage.removeItem(key));
      return true;
    } catch (err) {
      console.warn(`[StorageManager] Failed to clear:`, err);
      return false;
    }
  }

  /**
   * Get all keys managed by this prefix (without prefix)
   */
  getKeys(): string[] {
    try {
      const fullPrefix = this.prefix ? `${this.prefix}:` : '';
      const keys: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const fullKey = localStorage.key(i);
        if (fullKey && fullKey.startsWith(fullPrefix)) {
          const key = this.prefix ? fullKey.substring(fullPrefix.length) : fullKey;
          keys.push(key);
        }
      }

      return keys;
    } catch {
      return [];
    }
  }

  /**
   * Get size of storage for debugging
   */
  getSize(): number {
    try {
      let size = 0;
      for (let key of this.getKeys()) {
        const value = localStorage.getItem(this.getKey(key));
        if (value) {
          size += value.length + key.length;
        }
      }
      return size;
    } catch {
      return 0;
    }
  }

  /**
   * Export all data managed by this prefix as JSON
   */
  export(): Record<string, any> {
    const data: Record<string, any> = {};
    for (const key of this.getKeys()) {
      data[key] = this.get(key);
    }
    return data;
  }

  /**
   * Import data from JSON object
   */
  import(data: Record<string, any>): boolean {
    try {
      for (const [key, value] of Object.entries(data)) {
        this.set(key, value);
      }
      return true;
    } catch (err) {
      console.warn(`[StorageManager] Failed to import:`, err);
      return false;
    }
  }
}

/**
 * Global instance for app-level storage
 */
export const appStorage = new StorageManager('edenify');

/**
 * Create a scoped storage manager for account-specific data
 */
export const getAccountStorage = (accountId: string): StorageManager => {
  return new StorageManager(`edenify:${accountId}`);
};
