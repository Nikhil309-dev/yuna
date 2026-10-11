import { logger } from '#utils/logger';

class ErrorHandler {
    private hooks: Function[];
    private isShuttingDown: boolean;

    constructor() {
        this.hooks = [];
        this.isShuttingDown = false;

        process.on('uncaughtException', (error: Error) => {
            logger.error('UncaughtException', 'A critical error occurred', error);
            this.shutdown('uncaughtException').catch(() => process.exit(1));
        });

        // A single stray rejected promise should not take every shard down with it.
        process.on('unhandledRejection', (reason: any) => {
            logger.error('UnhandledRejection', 'Unhandled promise rejection', reason);
        });

        process.on('SIGINT', () => this.shutdown('SIGINT'));
        process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    }

    register(hook: Function) {
        if (typeof hook === 'function') {
            this.hooks.push(hook);
        }
    }

    async shutdown(signal: string) {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;

        logger.info('ErrorHandler', `Received ${signal}, initiating graceful shutdown...`);

        const deadline = new Promise(resolve => {
            setTimeout(() => {
                logger.warn('ErrorHandler', 'Shutdown deadline reached. Forcing exit.');
                resolve('TIMEOUT');
            }, 5000);
        });

        const cleanup = Promise.allSettled(this.hooks.map(hook => {
            try {
                return Promise.resolve(hook());
            } catch (err) {
                logger.error('ErrorHandler', 'Cleanup hook threw synchronously:', err);
                return Promise.resolve();
            }
        }));

        await Promise.race([cleanup, deadline]);

        logger.success('ErrorHandler', 'Shutdown complete. Goodbye!');
        process.exit(0);
    }
}

export const errorHandler = new ErrorHandler();
export { ErrorHandler };
export default errorHandler;

// Made by Nikhil Under CodeX Devs
