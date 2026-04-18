import { type CheerioAPI, createCheerioRouter, type KeyValueStore } from '@crawlee/cheerio';
import { Actor, log as globalLog } from 'apify';

import { sendTelegramMessage } from './utils.js';

interface OfferBase {
    title: string;
    price: string;
    description: string;
    location: string;
    created: string | null;
}

interface Offer extends OfferBase {
    url: string;
}

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
    await store?.setValue(SEEN_OFFERS_KEY, seenOffers);
}

/**
 * Parse from this format: Vytvořeno 18. 4. 2026, 13:02
 */
function parseCzechDate(text: string): Date | null {
    const match = /\d+\.\s*\d+\.\s*\d{4}/.exec(text)?.[0];
    if (!match) return null;
    const [day, month, year] = match.split('.').map(Number);
    return new Date(year, month - 1, day);
}

async function sendTelegramOffer(offerDetails: Offer, telegramToken: string, telegramChatId: string) {
    const createdStr = offerDetails.created ? new Date(offerDetails.created).toLocaleDateString('cs-CZ') : 'nezadáno';
    const message = `${offerDetails.title}\nCena: ${offerDetails.price}\nMísto: ${offerDetails.location}\nVytvořeno: ${createdStr}\n${offerDetails.url}`;
    try {
        await sendTelegramMessage(telegramToken, telegramChatId, message);
    } catch (err) {
        globalLog.error(`Failed to send Telegram message for ${offerDetails.url}`, { error: String(err) });
    }
}

/**
 * Get the URL of the next page on listings page.
 */
function scrapeNextPage($: CheerioAPI): string | null {
    return $('.paginator__item--next a[href*="vp-page="]').attr('href') ?? null;
}

/**
 * Scrape offer details from the offer page.
 */
function scrapeOfferDetails($: CheerioAPI): OfferBase {
    const createdRaw = $('.cb-time-ago').attr('title') ?? '';

    return {
        title: $('.offer-detail__header h1').text().trim(),
        price: $('.cb-seller-box__price').text().trim(),
        description: $('.offer-detail__desc').text().trim(),
        location: $('.cb-seller-box__location').text().trim(),
        created: parseCzechDate(createdRaw)?.toISOString() ?? null,
    };
}

/**
 * Scrape info seen on offer card on listings page
 */
function scrapeListingsOfferInfo($: CheerioAPI, startDate: Date | null, baseUrl: string): Offer[] {
    const info: Offer[] = [];
    $('a.cb-offer[href*="/inzerat/"]')
        .not('.cb-offer-list--vertical a')
        .each((_i, el) => {
            const publishedString = $(el).find('.cb-time-ago').attr('title') ?? '';
            const publishedDate = parseCzechDate(publishedString);
            if (startDate) {
                if (publishedDate && publishedDate < startDate) return;
            }

            const rawHref = $(el).attr('href');
            if (!rawHref) return;
            const href = new URL(rawHref, baseUrl).toString();

            info.push({
                url: href,
                title: $(el).find('.cb-offer__header h4').text().trim(),
                price: $(el).find('.cb-offer__price').text().trim(),
                description: $(el).find('.cb-offer__desc').text().trim(),
                location: $(el).find('.cb-offer__tag-location').text().trim(),
                created: publishedDate?.toISOString() ?? null,
            });
        });
    return info;
}

export const router = createCheerioRouter();

router.addDefaultHandler(async ({ enqueueLinks, pushData, request, $, log }) => {
    const startDate = request.userData.startDate ? new Date(request.userData.startDate) : null;

    const offerInfos = scrapeListingsOfferInfo($, startDate, request.loadedUrl);

    if (offerInfos.length === 0) {
        log.info(`No new offers found on this page: ${request.loadedUrl}`);
        return;
    }

    if (request.userData.detailedOutput) {
        // Enqueue offer pages for detailed scraping
        log.info(`Found ${offerInfos.length} offers on this page: ${request.loadedUrl}`);
        await enqueueLinks({
            urls: offerInfos.map((o) => o.url),
            baseUrl: request.loadedUrl,
            label: 'OFFER',
            userData: request.userData,
        });
    } else {
        // Push the scraped data and send Telegram notification
        for (const o of offerInfos) {
            await pushData(o);

            const offerId = new URL(o.url).pathname;
            const wasSeen = Boolean(seenOffers[offerId]);
            seenOffers[offerId] = new Date().toISOString();
            if (wasSeen) {
                log.info(`Already seen, skipping Telegram notification: ${offerId}`);
                continue;
            }

            const { telegramToken, telegramChatId } = request.userData;
            if (telegramToken && telegramChatId) {
                await sendTelegramOffer(o, telegramToken, telegramChatId);
            }
        }
    }

    const nextPage = scrapeNextPage($);
    if (nextPage) {
        log.info(`Enqueuing next page: ${nextPage}`);
        await enqueueLinks({ urls: [nextPage], baseUrl: request.loadedUrl, userData: request.userData });
    }
});

router.addHandler('OFFER', async ({ request, $, log, pushData }) => {
    const offerDetails = scrapeOfferDetails($);
    const offer = { ...offerDetails, url: request.loadedUrl };
    await pushData(offer);

    const offerId = new URL(request.loadedUrl).pathname;
    const wasSeen = Boolean(seenOffers[offerId]);
    seenOffers[offerId] = new Date().toISOString();
    if (wasSeen) {
        log.info(`Already seen, skipping Telegram notification: ${offerId}`);
        return;
    }

    const { telegramToken, telegramChatId } = request.userData;
    if (telegramToken && telegramChatId) {
        await sendTelegramOffer(offer, telegramToken, telegramChatId);
    }
});
