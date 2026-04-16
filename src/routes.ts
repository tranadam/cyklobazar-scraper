import { createCheerioRouter } from '@crawlee/cheerio';

export const router = createCheerioRouter();

function parseCzechDate(text: string): Date | null {
    const match = /\d+\.\s*\d+\.\s*\d{4}/.exec(text)?.[0];
    if (!match) return null;
    const [day, month, year] = match.split('.').map(Number);
    return new Date(year, month - 1, day);
}

async function sendTelegramMessage(token: string, chatId: string, text: string) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) throw new Error(`Telegram API error: ${res.status}`);
}

router.addDefaultHandler(async ({ enqueueLinks, request, $, log }) => {
    const startDate = request.userData.startDate ? new Date(request.userData.startDate) : null;

    const offerLinks: string[] = [];
    $('a.cb-offer[href*="/inzerat/"]').each((_i, el) => {
        if (startDate) {
            const publishedString = $(el).find('.cb-time-ago').attr('title') ?? '';
            const publishedDate = parseCzechDate(publishedString);
            if (publishedDate && publishedDate < startDate) return;
        }
        const href = $(el).attr('href');
        if (href) offerLinks.push(href);
    });

    if (offerLinks.length === 0) {
        log.info('No new offers found on this page.');
        return;
    }

    log.info(`Found ${offerLinks.length} offers on this page.`);
    await enqueueLinks({ urls: offerLinks, baseUrl: request.loadedUrl, label: 'OFFER', userData: request.userData });

    const nextPage = $('.paginator__item--next a[href*="vp-page="]').attr('href');
    if (nextPage) {
        log.info(`Enqueuing next page: ${nextPage}`);
        await enqueueLinks({ urls: [nextPage], baseUrl: request.loadedUrl, userData: request.userData });
    }
});

router.addHandler('OFFER', async ({ request, $, log, pushData }) => {
    const offerId = new URL(request.loadedUrl).pathname;
    const { telegramToken, telegramChatId, seenOffers } = request.userData;

    if (seenOffers[offerId]) {
        log.info(`Already seen, skipping: ${offerId}`);
        return;
    }

    const title = $('.offer-detail__header h1').text().trim();
    const price = $('.cb-seller-box__price').text().trim();
    const description = $('.offer-detail__desc').text().trim();
    const createdRaw = $('.cb-time-ago').attr('title') ?? '';
    const created = parseCzechDate(createdRaw);
    const location = $('.cb-seller-box__location').text().trim();

    await pushData({ title, price, description, created: created?.toISOString() ?? null, location, url: request.loadedUrl });
    seenOffers[offerId] = new Date().toISOString();

    if (telegramToken && telegramChatId) {
        const createdStr = created ? created.toLocaleDateString('cs-CZ') : 'neznámé';
        const message = `${title}\nCena: ${price}\nMísto: ${location}\nVytvořeno: ${createdStr}\nURL: ${request.loadedUrl}`;
        try {
            await sendTelegramMessage(telegramToken, telegramChatId, message);
        } catch (err) {
            log.error(`Failed to send Telegram message for ${offerId}`, { error: String(err) });
        }
    }
});
