import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

export interface AssetEntry {
  /**
   * Glob pattern(s) relative to srcRoot to watch.
   * E.g. "*.json" or ["*.graphql", "*.proto"].
   */
  include: string | string[];

  /**
   * Optional glob(s) to exclude.
   */
  exclude?: string | string[];
}

export interface AssetWatcherOptions {
  /**
   * The source root directory (e.g., `src`). Patterns are resolved relative to this.
   */
  srcRoot: string;

  /**
   * The output directory (e.g., `dist`). Files are mirrored here.
   */
  outDir: string;

  /**
   * List of asset entries to watch and copy.
   */
  assets: AssetEntry[];
}

/**
 * Watches non-TypeScript asset files and mirrors changes into the output
 * directory, replicating the same relative path structure.
 *
 * Emits:
 * - `change` (srcPath: string, destPath: string) — when an asset is copied/removed.
 * - `error` (err: Error)
 */
export class AssetWatcher extends EventEmitter {
  private watcher: fs.FSWatcher | null = null;
  private readonly srcRoot: string;
  private readonly outDir: string;
  private readonly includeGlobs: string[];
  private readonly excludeGlobs: string[];
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly debounceMs = 100;

  constructor(private readonly options: AssetWatcherOptions) {
    super();
    this.srcRoot = path.resolve(options.srcRoot);
    this.outDir = path.resolve(options.outDir);

    this.includeGlobs = options.assets.flatMap((entry) => {
      const includes = Array.isArray(entry.include) ? entry.include : [entry.include];
      return includes.map((g) => path.join(this.srcRoot, g));
    });

    this.excludeGlobs = options.assets.flatMap((entry) => {
      const excludes = entry.exclude ? (Array.isArray(entry.exclude) ? entry.exclude : [entry.exclude]) : [];
      return excludes.map((g) => path.join(this.srcRoot, g));
    });
  }

  start(): void {
    // 1. Initial scan: copy existing assets on startup
    this.initialScan();

    // 2. Watch for file changes recursively using native node:fs.watch
    try {
      this.watcher = fs.watch(this.srcRoot, { recursive: true });
      this.watcher.on('change', (eventType, filename) => {
        if (!filename) return;
        const absPath = path.join(this.srcRoot, filename.toString());
        if (!this.isAsset(absPath)) return;
        this.debouncedHandleChange(absPath);
      });
      this.watcher.on('error', (err: unknown) => {
        this.emit('error', err as Error);
      });
    } catch (err: unknown) {
      this.emit('error', err as Error);
    }
  }

  async close(): Promise<void> {
    this.watcher?.close();
    this.watcher = null;
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  private initialScan(): void {
    try {
      if (!fs.existsSync(this.srcRoot)) return;
      const entries = fs.readdirSync(this.srcRoot, { recursive: true, withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const parentDir = entry.parentPath || (entry as any).path || this.srcRoot;
        const absPath = path.join(parentDir, entry.name);
        if (this.isAsset(absPath)) {
          this.copyAsset(absPath);
        }
      }
    } catch (err) {
      this.emit('error', err as Error);
    }
  }

  private debouncedHandleChange(absPath: string): void {
    const existing = this.debounceTimers.get(absPath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(absPath);
      this.handleChange(absPath);
    }, this.debounceMs);

    this.debounceTimers.set(absPath, timer);
  }

  private handleChange(absPath: string): void {
    if (fs.existsSync(absPath)) {
      this.copyAsset(absPath);
    } else {
      this.removeAsset(absPath);
    }
  }

  private isAsset(absPath: string): boolean {
    if (!this.includeGlobs.some((g) => path.matchesGlob(absPath, g))) return false;
    if (this.excludeGlobs.some((g) => path.matchesGlob(absPath, g))) return false;
    return true;
  }

  private copyAsset(srcPath: string): void {
    const destPath = this.resolveDestPath(srcPath);
    try {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      this.emit('change', srcPath, destPath);
    } catch (err) {
      this.emit('error', err as Error);
    }
  }

  private removeAsset(srcPath: string): void {
    const destPath = this.resolveDestPath(srcPath);
    try {
      if (fs.existsSync(destPath)) {
        fs.rmSync(destPath);
        this.emit('change', srcPath, destPath);
      }
    } catch (err) {
      this.emit('error', err as Error);
    }
  }

  private resolveDestPath(srcPath: string): string {
    const relative = path.relative(this.srcRoot, srcPath);
    return path.join(this.outDir, relative);
  }
}
