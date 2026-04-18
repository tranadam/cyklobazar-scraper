import { type CheerioAPI, createCheerioRouter, type KeyValueStore } from '@crawlee/cheerio';
import { Actor, log as globalLog } from 'apify';

import { sendTelegramMessage } from './utils.js';

const STORE_NAME = 'cyklobazar-state';
const SEEN_OFFERS_KEY = 'SEEN_OFFERS';
const PRUNE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

let seenOffers: Record<string, string> = {};
let store: KeyValueStore;

export async function initSeenOffers() {
    store = await Actor.openKeyValueStore(STORE_NAME);
    seenOffers = (await store.getValue(SEEN_OFFERS_KEY)) ?? {};
    const cutoff = Date.now() - PRUNE_AFTER_MS;
    for (const [id, date] of Object.entries(seenOffers)) {
        if (new Date(date).getTime() < cutoff) delete seenOffers[id];
    }
    globalLog.info(`Loaded ${Object.keys(seenOffers).length} seen offers after pruning`);
}

export async function saveSeenOffers() {
    await store.setValue(SEEN_OFFERS_KEY, seenOffers);
}

function parseCzechDate(text: string): Date | null {
    const match = /\d+\.\s*\d+\.\s*\d{4}/.exec(text)?.[0];
    if (!match) return null;
    const [day, month, year] = match.split('.').map(Number);
    return new Date(year, month - 1, day);
}

/**
 * Scrape links from the listing page, filtering by startDate if provided. Excludes ad offers.
 */
function scrapeOfferLinks($: CheerioAPI, startDate: Date | null): string[] {
    const offerLinks: string[] = [];
    $('a.cb-offer[href*="/inzerat/"]')
        .not('.cb-offer-list--vertical a')
        .each((_i, el) => {
            if (startDate) {
                const publishedString = $(el).find('.cb-time-ago').attr('title') ?? '';
                const publishedDate = parseCzechDate(publishedString);
                if (publishedDate && publishedDate < startDate) return;
            }
            const href = $(el).attr('href');
            if (href) offerLinks.push(href);
        });
    return offerLinks;
}

/**
 * Get the URL of the next page on listings page.
 */
function scrapeNextPage($: CheerioAPI): string | null {
    const nextPage = $('.paginator__item--next a[href*="vp-page="]').attr('href');
    return nextPage || null;
}

/**
 * Scrape offer details from the offer page.
 */
function scrapeOfferDetails($: CheerioAPI) {
    const createdRaw = $('.cb-time-ago').attr('title') ?? '';

    return {
        title: $('.offer-detail__header h1').text().trim(),
        price: $('.cb-seller-box__price').text().trim(),
        description: $('.offer-detail__desc').text().trim(),
        location: $('.cb-seller-box__location').text().trim(),
        created: parseCzechDate(createdRaw)?.toISOString() ?? null,
    };
}

export const router = createCheerioRouter();

router.addDefaultHandler(async ({ enqueueLinks, request, $, log }) => {
    const startDate = request.userData.startDate ? new Date(request.userData.startDate) : null;

    const offerLinks = scrapeOfferLinks($, startDate);

    if (offerLinks.length === 0) {
        log.info(`No new offers found on this page: ${request.loadedUrl}`);
        return;
    }

    log.info(`Found ${offerLinks.length} offers on this page: ${request.loadedUrl}`);
    await enqueueLinks({ urls: offerLinks, baseUrl: request.loadedUrl, label: 'OFFER', userData: request.userData });

    const nextPage = scrapeNextPage($);
    if (nextPage) {
        log.info(`Enqueuing next page: ${nextPage}`);
        await enqueueLinks({ urls: [nextPage], baseUrl: request.loadedUrl, userData: request.userData });
    }
});

router.addHandler('OFFER', async ({ request, $, log, pushData }) => {
    const offerId = new URL(request.loadedUrl).pathname;

    const offerDetails = scrapeOfferDetails($);
    await pushData({ ...offerDetails, url: request.loadedUrl });

    if (seenOffers[offerId]) {
        log.info(`Already seen, skipping Telegram notification: ${offerId}`);
        return;
    }

    seenOffers[offerId] = new Date().toISOString();

    const { telegramToken, telegramChatId } = request.userData;
    if (telegramToken && telegramChatId) {
        const createdStr = offerDetails.created
            ? new Date(offerDetails.created).toLocaleDateString('cs-CZ')
            : 'nezadáno';
        const message = `${offerDetails.title}\n\
Cena: ${offerDetails.price}\n\
Místo: ${offerDetails.location}\n\
Vytvořeno: ${createdStr}\n\
URL: ${request.loadedUrl}`;
        try {
            await sendTelegramMessage(telegramToken, telegramChatId, message);
        } catch (err) {
            log.error(`Failed to send Telegram message for ${offerId}`, { error: String(err) });
        }
    }
});
