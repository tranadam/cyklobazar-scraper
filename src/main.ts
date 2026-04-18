import { CheerioCrawler } from '@crawlee/cheerio';
import { Actor } from 'apify';

import { initSeenOffers, router, saveSeenOffers } from './routes.js';
import { sleep } from './utils.js';

interface Input {
    urls: { url: string }[];
    detailedOutput: boolean;
    startDate?: string;
    telegramToken?: string;
    telegramChatId?: string;
}

Actor.on('aborting', async () => {
    await saveSeenOffers();
    await sleep(1000);
    await Actor.exit();
});

await Actor.init();

const input = await Actor.getInput<Input>();
if (!input?.urls?.length) throw new Error('At least one URL is required');
const { urls, telegramToken, startDate, telegramChatId, detailedOutput } = input;

await initSeenOffers();

const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 100,
    requestHandler: router,
});

const userData = { startDate, telegramToken, telegramChatId, detailedOutput };
try {
    await crawler.run(urls.map((u) => ({ ...u, userData })));
} finally {
    await saveSeenOffers();
}

await Actor.exit();
