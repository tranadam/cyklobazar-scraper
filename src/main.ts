import { CheerioCrawler } from '@crawlee/cheerio';
import { Actor, log } from 'apify';

import { router } from './routes.js';

const SEEN_OFFERS_KEY = 'SEEN_OFFERS';
const PRUNE_AFTER_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

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

const seenOffers: Record<string, string> = (await Actor.getValue(SEEN_OFFERS_KEY)) ?? {};
const cutoff = Date.now() - PRUNE_AFTER_MS;
for (const [id, date] of Object.entries(seenOffers)) {
    if (new Date(date).getTime() < cutoff) delete seenOffers[id];
}
log.info(`Loaded ${Object.keys(seenOffers).length} seen offers after pruning`);

const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 100,
    requestHandler: router,
});

const userData = { startDate, telegramToken, telegramChatId, seenOffers };
await crawler.run(urls.map((u) => ({ ...u, userData })));

await Actor.setValue(SEEN_OFFERS_KEY, seenOffers);
log.info(`Saved ${Object.keys(seenOffers).length} seen offers`);

await Actor.exit();
