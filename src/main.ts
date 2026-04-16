import { CheerioCrawler } from '@crawlee/cheerio';
import { Actor } from 'apify';

import { router } from './routes.js';

await Actor.init();

interface Input {
    urls: { url: string }[];
    startDate?: string;
    telegramToken?: string;
    telegramChatId?: string;
}

const input = await Actor.getInput<Input>();
if (!input) throw new Error('Input is required');
const { urls, telegramToken, startDate, telegramChatId } = input;

const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 100,
    requestHandler: router,
});

await crawler.run(urls.map((u) => ({ ...u, userData: { startDate, telegramToken, telegramChatId } })));

await Actor.exit();
