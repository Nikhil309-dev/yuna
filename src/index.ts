import { YunaClient } from '#core/YunaClient';
import { logger } from '#utils/logger';

const client = new YunaClient();

const main = async () => {
	try {
		await client.init();
		logger.success('Main', 'Discord bot initialized successfully');
	} catch (error: any) {
		logger.error('Main', 'Failed to initialize Discord bot', error);
		process.exit(1);
	}
};

main();

export default client;

// Made by Nikhil Under CodeX Devs
