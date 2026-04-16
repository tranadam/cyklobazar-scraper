import { CheerioCrawler } from '@crawlee/cheerio';
import { Actor, log } from 'apify';

import { initSeenOffers, router } from './routes.js';

interface Input {
    urls: { url: string }[];
    startDate?: string;
    telegramToken?: string;
    telegramChatId?: string;
}

await Actor.init();

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

await Actor.exit();
