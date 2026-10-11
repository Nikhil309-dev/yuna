import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger, pink, mint, red, gray, white } from '#utils/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { Client } from "discord.js";

export class EventLoader {
  client: any;
  eventsPath: string;
  loadedEventsCount: number;
  emitterCounts: any;
  failedEvents: any;
  registeredEvents: { emitter: any; eventName: string; execute: (...args: any[]) => void }[];

  constructor(client: Client) {
    this.client = client;
    this.eventsPath = path.join(__dirname, '../events');
    this.loadedEventsCount = 0;
    this.emitterCounts = { client: 0, player: 0, node: 0 };
    this.failedEvents = [];
    this.registeredEvents = [];
  }

  async load() {
    return this.loadEvents();
  }

  async loadEvents() {
    this.loadedEventsCount = 0;
    this.emitterCounts = { client: 0, player: 0, node: 0 };
    this.failedEvents = [];

    for (const { emitter, eventName, execute } of this.registeredEvents) {
      try {
        emitter.removeListener(eventName, execute);
      } catch (err) {
        logger.warn('EventLoader', `Failed to remove listener for ${eventName}:`, err);
      }
    }
    this.registeredEvents = [];

    try {
      if (!fs.existsSync(this.eventsPath)) {
        logger.warn('EventLoader', `Events directory not found: ${this.eventsPath}`);
        return;
      }

      const eventTypes = fs.readdirSync(this.eventsPath, { withFileTypes: true })
        .filter((entry: any) => entry.isDirectory())
        .map((entry: any) => entry.name);

      for (const eventType of eventTypes) {
        const emitter = this.getEmitter(eventType);
        if (!emitter) continue;
        const typePath = path.join(this.eventsPath, eventType);
        await this.recursiveLoadEvents(typePath, emitter, eventType);
      }

      if (this.failedEvents.length === 0) {
        const countsStr = Object.entries(this.emitterCounts).filter((val: any) => val[1] > 0).map((val: any) => `${val[0]}: ${val[1]}`).join(' · ');

        console.log(
          `${logger.formatTime()} ${pink('🌸 [Events]')} ${mint(`✔ All ${this.loadedEventsCount} events loaded successfully`)} ${gray(`(${countsStr})`)}`
        );
      } else {
        console.log(
          `${logger.formatTime()} ${pink('🌸 [Events]')} ${red(`✖ Failed to load ${this.failedEvents.length} event(s):`)}`
        );
        for (const failure of this.failedEvents) {
          console.log(`   ${red('└─')} ${white(failure.file)}: ${red(failure.error)}`);
        }
      }
    } catch (error) {
      logger.error('EventLoader', 'Failed to load events', error);
    }
  }

  getEmitter(type: string) {
    switch (type) {
      case 'discord':
      case 'client':
        return this.client;
      case 'player':
        return this.client.lavalink;
      case 'node':
        return this.client.lavalink?.nodeManager;
      default:
        return this.client;
    }
  }

  async recursiveLoadEvents(dirPath: string, emitter: any, rootType: string) {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await this.recursiveLoadEvents(fullPath, emitter, rootType);
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          await this.loadEventFile(fullPath, emitter, rootType);
        }
      }
    } catch (error) {
      logger.error('EventLoader', `Failed to read directory: ${dirPath}`, error);
    }
  }

  async loadEventFile(filePath: string, emitter: any, rootType: string) {
    const relName = path.relative(process.cwd(), filePath);
    try {
      const module = await import(`file:${filePath}`);
      if (!module?.default) {
        this.failedEvents.push({ file: relName, error: 'Missing default export' });
        return;
      }

      const event = module.default;
      const eventName = event.name || path.basename(filePath, '.ts');
      const once = event.once || false;

      const execute = async (...args: any[]) => {
        try {

          if (rootType === 'player' || rootType === 'node') {
            await event.execute(...args, this.client.lavalink, this.client);
          } else {
            await event.execute(...args, this.client);
          }
        } catch (error) {
          logger.error('EventLoader', `Error executing event ${eventName}:`, error);
        }
      };

      if (emitter) {
        if (once) {
          emitter.once(eventName, execute);
        } else {
          emitter.on(eventName, execute);
        }
        this.registeredEvents.push({ emitter, eventName, execute });
      }

      this.loadedEventsCount++;
      const categoryKey = rootType === 'discord' ? 'client' : rootType;
      this.emitterCounts[categoryKey] = (this.emitterCounts[categoryKey] || 0) + 1;
    } catch (error) {
      this.failedEvents.push({ file: relName, error: (error as any).message || error });
    }
  }
}

export default EventLoader;

// Made by Nikhil Under CodeX Devs
