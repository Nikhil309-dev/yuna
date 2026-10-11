import fs from 'fs';
import path from 'path';
import { logger } from '#utils/logger';

export interface SchedulerOptions {
  pollIntervalMs?: number;
}

export interface SchedulerInterval {
  seconds?: number;
  minutes?: number;
  hours?: number;
}

export interface SchedulerJob {
  name: string;
  mode: string;
  intervalSeconds: number;
  nextRun: number;
  lastRun: number;
  totalRuns: number;
  enabled: boolean;
  _isRunning: boolean;
}

export class Scheduler {
  public client: any;
  public pollIntervalMs: number;
  public persistencePath: string;
  public jobs: Map<string, SchedulerJob>;
  public registry: Map<string, Function>;
  public timer: NodeJS.Timeout | null;
  public isRunning: boolean;

  constructor(client: any, options: SchedulerOptions = {}) {
    this.client = client;
    this.pollIntervalMs = options.pollIntervalMs || 1000;
    this.persistencePath = path.join(process.cwd(), 'database', 'scheduler.json');

    this.jobs = new Map();
    this.registry = new Map();
    this.timer = null;
    this.isRunning = false;
  }

  async init() {
    this.loadState();

    const now = Date.now();
    for (const [, job] of this.jobs.entries()) {
      if (job.nextRun < now) {
        job.nextRun = now + job.intervalSeconds * 1000;
      }
    }
    this.start();
    logger.success('Scheduler', 'Persistent Task Scheduler initialized');
  }

  register(name: string, taskFunc: Function) {
    if (!name || typeof taskFunc !== 'function') {
      throw new Error('Task must have a name and a callable handler.');
    }
    this.registry.set(name, taskFunc);
    logger.debug('Scheduler', `Registered task: ${name}`);
  }

  every(name: string, interval: SchedulerInterval = {}, taskFunc: Function | null = null) {
    if (taskFunc) this.register(name, taskFunc);

    const totalSeconds =
      (interval.seconds || 0) +
      (interval.minutes || 0) * 60 +
      (interval.hours || 0) * 3600;

    if (totalSeconds <= 0) {
      throw new Error(`Interval for task "${name}" must be greater than 0.`);
    }

    const existing = this.jobs.get(name);
    const nextRun = existing?.nextRun && existing.nextRun > Date.now()
      ? existing.nextRun
      : Date.now() + totalSeconds * 1000;

    const job: SchedulerJob = {
      name,
      mode: 'interval',
      intervalSeconds: totalSeconds,
      nextRun,
      enabled: true,
      lastRun: existing?.lastRun || 0,
      totalRuns: existing?.totalRuns || 0,
      _isRunning: false
    };

    this.jobs.set(name, job);
    this.saveState();
    return job;
  }

  cron(name: string, pattern: string, taskFunc: Function | null = null) {
    if (taskFunc) this.register(name, taskFunc);

    let intervalSeconds = 3600;
    if (pattern === '@minutely') intervalSeconds = 60;
    else if (pattern === '@hourly') intervalSeconds = 3600;
    else if (pattern === '@daily') intervalSeconds = 86400;
    else if (pattern.startsWith('*/')) {
      const mins = parseInt(pattern.slice(2).split(' ')[0], 10) || 1;
      intervalSeconds = mins * 60;
    }

    return this.every(name, { seconds: intervalSeconds }, taskFunc);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    this.timer = setInterval(async () => {
      await this.tick();
    }, this.pollIntervalMs);
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.saveState();
  }

  async tick() {
    const now = Date.now();

    for (const [name, job] of this.jobs.entries()) {
      if (!job.enabled || job._isRunning) continue;

      if (now >= job.nextRun) {
        const handler = this.registry.get(name);
        if (!handler) {
          logger.warn('Scheduler', `Job "${name}" scheduled but no handler registered.`);
          continue;
        }

        job._isRunning = true;
        job.lastRun = now;
        job.totalRuns = (job.totalRuns || 0) + 1;
        job.nextRun = now + job.intervalSeconds * 1000;

        (async () => {
          try {
            await handler(this.client);
          } catch (err: any) {
            logger.error('Scheduler', `Task "${name}" failed:`, err);
          } finally {
            job._isRunning = false;
            this.saveState();
          }
        })();
      }
    }
  }

  loadState() {
    try {
      if (fs.existsSync(this.persistencePath)) {
        const raw = fs.readFileSync(this.persistencePath, 'utf8').trim();

        const data = raw ? JSON.parse(raw) : [];
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item.name) {
              this.jobs.set(item.name, { ...item, _isRunning: false });
            }
          }
        }
      }
    } catch (err: any) {
      logger.warn('Scheduler', `Failed to load scheduler state: ${err.message}`);
    }
  }

  async saveState() {
    try {
      const dir = path.dirname(this.persistencePath);
      if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true });

      const stateArray = Array.from(this.jobs.values()).map(job => ({
        name: job.name,
        mode: job.mode,
        intervalSeconds: job.intervalSeconds,
        nextRun: job.nextRun,
        lastRun: job.lastRun,
        totalRuns: job.totalRuns,
        enabled: job.enabled
      }));

      await fs.promises.writeFile(this.persistencePath, JSON.stringify(stateArray, null, 2), 'utf8');
    } catch (err: any) {

      logger.warn('Scheduler', `Failed to save scheduler state: ${err?.message || err}`);
    }
  }

  getJobs() {
    return Array.from(this.jobs.values()).map(job => ({
      name: job.name,
      nextRun: new Date(job.nextRun).toISOString(),
      lastRun: job.lastRun ? new Date(job.lastRun).toISOString() : 'Never',
      totalRuns: job.totalRuns || 0,
      enabled: job.enabled,
      isRunning: job._isRunning
    }));
  }
}

export default Scheduler;

// Made by Nikhil Under CodeX Devs
