import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, '../../logs');

export const pink = chalk.hex('#ff79c6');
export const purple = chalk.hex('#bd93f9');
export const mint = chalk.hex('#50fa7b');
export const yellow = chalk.hex('#f1fa8c');
export const red = chalk.hex('#ff5555');
export const cyan = chalk.hex('#8be9fd');
export const gray = chalk.hex('#6272a4');
export const white = chalk.hex('#f8f8f2');

const WEBHOOK_COLORS: Record<string, number> = {
  INFO: 0x5865f2,
  SUCCESS: 0x57f287,
  WARN: 0xfee75c,
  ERROR: 0xed4245,
  DEBUG: 0x99aab5
};

class WebhookLogger {
  static latest: Record<string, string> = {};
  static scheduled = false;

  static enabled() {
    return process.env.WEBHOOK_ENABLED !== 'false' && !!process.env.WEBHOOK_URL;
  }

  static levelEnabled(level: string) {
    return process.env[`WEBHOOK_${level}_ENABLED`] !== 'false';
  }

  static capture(level: string, tag: string, message: string, detail = '') {
    if (!this.enabled() || !this.levelEnabled(level)) return;
    if (level === 'DEBUG' && process.env.WEBHOOK_DEBUG_ENABLED !== 'true') return;
    this.latest[level] = `**[${tag}]** ${message}${detail ? `\n\`\`\`\n${detail.slice(0, 1500)}\n\`\`\`` : ''}`;
    this.schedule();
  }

  static schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    const t = setTimeout(() => this.flush(), 2000);
    if (typeof t.unref === 'function') t.unref();
  }

  static async flush() {
    this.scheduled = false;
    const batch = this.latest;
    this.latest = {};
    for (const [level, description] of Object.entries(batch)) {
      try {
        await fetch(process.env.WEBHOOK_URL as string, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: process.env.WEBHOOK_USERNAME || 'Bot Logger',
            avatar_url: process.env.WEBHOOK_AVATAR_URL || undefined,
            embeds: [{
              title: `Yuna · ${level}`,
              description,
              color: WEBHOOK_COLORS[level] ?? 0x99aab5,
              timestamp: new Date().toISOString()
            }]
          })
        });
      } catch (e: any) {
        console.error('Webhook log failed:', e?.message);
      }
    }
  }
}


class Logger {

  public logFilePath: string;
  public errorLogFilePath: string;

  constructor() {
    this.logFilePath = '';
    this.errorLogFilePath = '';
    this.initLogFiles();
  }

  initLogFiles() {
    try {
      if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
      }
      this.logFilePath = path.join(LOG_DIR, 'bot.log');
      this.errorLogFilePath = path.join(LOG_DIR, 'error.log');
      this.rotateLogFileIfNeeded(this.logFilePath);
      this.rotateLogFileIfNeeded(this.errorLogFilePath);
    } catch (error) {
      console.error('Failed to initialize log files:', error);
    }
  }

  rotateLogFileIfNeeded(filePath: any) {
    try {
      if (!fs.existsSync(filePath)) return;
      const fileSizeInMB = fs.statSync(filePath).size / (1024 * 1024);
      if (fileSizeInMB > 5) {
        const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
        fs.renameSync(filePath, `${filePath}.${timestamp}`);
      }
    } catch (error) {
      console.error(`Failed to rotate log file ${filePath}:`, error);
    }
  }

  writeToLogFile(filePath: any, content: any) {
    try {
      fs.appendFileSync(filePath, `${content}\n`);
    } catch (error) {
      console.error(`Failed to write to log file ${filePath}:`, error);
    }
  }

  getTimestamp() {
    const now = new Date();
    return now.toTimeString().split(' ')[0];
  }

  formatTag(tag: any) {
    return pink(`[${tag}]`);
  }

  formatTime() {
    return gray(`[${this.getTimestamp()}]`);
  }

  info(tag: any, message: string, ...args: any[]) {
    const formatted = `${this.formatTime()} ${this.formatTag(tag)} ${cyan('ℹ')} ${white(message)}`;
    console.log(formatted, ...args);
    this.writeToLogFile(this.logFilePath, `[${this.getTimestamp()}] [INFO] [${tag}] ${message} ${args.join(' ')}`);
    WebhookLogger.capture('INFO', tag, message, args.join(' '));
  }

  success(tag: any, message: string, ...args: any[]) {
    const formatted = `${this.formatTime()} ${this.formatTag(tag)} ${mint('✔')} ${white(message)}`;
    console.log(formatted, ...args);
    this.writeToLogFile(this.logFilePath, `[${this.getTimestamp()}] [SUCCESS] [${tag}] ${message} ${args.join(' ')}`);
    WebhookLogger.capture('SUCCESS', tag, message, args.join(' '));
  }

  warn(tag: any, message: string, ...args: any[]) {
    const formatted = `${this.formatTime()} ${this.formatTag(tag)} ${yellow('⚠')} ${yellow(message)}`;
    console.warn(formatted, ...args);
    this.writeToLogFile(this.logFilePath, `[${this.getTimestamp()}] [WARN] [${tag}] ${message} ${args.join(' ')}`);
    WebhookLogger.capture('WARN', tag, message, args.join(' '));
  }

  error(tag: any, message: string, error: any, ...args: any[]) {
    const formatted = `${this.formatTime()} ${this.formatTag(tag)} ${red('✖')} ${red(message)}`;
    console.error(formatted);
    if (error) {
      console.error(red(error.stack || error.message || error));
    }
    this.writeToLogFile(
      this.errorLogFilePath,
      `[${this.getTimestamp()}] [ERROR] [${tag}] ${message} ${error?.stack || error || ''} ${args.join(' ')}`
    );
    WebhookLogger.capture('ERROR', tag, message, error?.stack || String(error || ''));
  }

  debug(tag: any, message: string, ...args: any[]) {
    if (process.env.DEBUG === 'true') {
      const formatted = `${this.formatTime()} ${this.formatTag(tag)} ${purple('◆')} ${gray(message)}`;
      console.log(formatted, ...args);
    }
    WebhookLogger.capture('DEBUG', tag, message, args.join(' '));
  }
}

export const logger = new Logger();
export default logger;

// Made by Nikhil Under CodeX Devs
