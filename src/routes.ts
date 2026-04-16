import { createCheerioRouter } from '@crawlee/cheerio';

export const router = createCheerioRouter();

router.addDefaultHandler(async ({ enqueueLinks, request, $, log }) => {
    const offerLinks: string[] = [];
    const startDate = new Date(request.userData.startDate);
    $('a.cb-offer[href*="/inzerat/"]').each((i, el) => {
        const publishedString = $(el).find('.cb-time-ago').attr('title');
        const publishedAt = /\d+\. \d+\. \d{4}/.exec(publishedString ?? '')?.[0];
        if (publishedAt) {
            const [day, month, year] = publishedAt.split('.').map(Number);
            const publishedDate = new Date(year, month - 1, day);
            if (publishedDate < startDate) return;
        }
        const offerLink = $(el).attr('href');
        if (offerLink) {
            log.info(`Found offer ${i}: ${offerLink}`);
            offerLinks.push(offerLink);
        }
    });
    await enqueueLinks({ urls: offerLinks, baseUrl: request.loadedUrl, label: 'OFFER' });
});

router.addHandler('OFFER', async ({ request, $, log, pushData }) => {
    const title = $('.offer-detail__header h1').text().trim();
    const price = $('.cb-seller-box__price').text().trim();
    const description = $('.offer-detail__desc').text().trim();
    const created = $('.cb-time-ago').attr('title');
    const location = $('.cb-seller-box__location').text().trim();
    await pushData({ title, price, description, created, location, url: request.loadedUrl });

    try {
        const { telegramToken, telegramChatId } = request.userData;
        if (telegramToken && telegramChatId) {
            const message = `${title}\nPrice: ${price}\nLocation: ${location}\nCreated: ${created}\nURL: ${request.loadedUrl}`;
            await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: telegramChatId, text: message }),
            });
        }
    } catch {
        log.error('Error sending Telegram message.');
    }
});
