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

// Load seen offers and prune entries older than 30 days
const seenOffers: Record<string, string> = (await Actor.getValue('SEEN_OFFERS')) ?? {};
const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
for (const [id, date] of Object.entries(seenOffers)) {
    if (new Date(date).getTime() < cutoff) delete seenOffers[id];
}

const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 100,
    requestHandler: router,
});

await crawler.run(urls.map((u) => ({ ...u, userData: { startDate, telegramToken, telegramChatId, seenOffers } })));

await Actor.setValue('SEEN_OFFERS', seenOffers);

await Actor.exit();
