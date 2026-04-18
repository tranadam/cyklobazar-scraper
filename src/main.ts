import { CheerioCrawler } from '@crawlee/cheerio';
import { Actor } from 'apify';

import { initSeenOffers, router, saveSeenOffers } from './routes.js';
import { sleep } from './utils.js';

interface Input {
    urls: { url: string }[];
    startDate?: string;
    telegramToken?: string;
    telegramChatId?: string;
}

await Actor.init();

Actor.on('aborting', async () => {
    await saveSeenOffers();
    await sleep(1000);
    await Actor.exit();
});

const input = await Actor.getInput<Input>();
if (!input?.urls?.length) throw new Error('At least one URL is required');
const { urls, telegramToken, startDate, telegramChatId } = input;

await initSeenOffers();

const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 100,
    requestHandler: router,
});

const userData = { startDate, telegramToken, telegramChatId };
await crawler.run(urls.map((u) => ({ ...u, userData })));

await saveSeenOffers();
await Actor.exit();
