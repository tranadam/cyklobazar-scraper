## Cyklobazar Scraper

Cyklobazar Scraper extracts (not only) **bicycle offers** from [cyklobazar.cz](https://www.cyklobazar.cz) Provide a URL with your filters (category, price range, etc.) and the scraper collects all matching offers with details like title, price, location, and listing date.

It also supports **Telegram notifications** — get a message every time a new offer appears that matches your criteria.

## How to use

1. Click **Start** on this Actor page
2. Paste one or more cyklobazar URLs into the **URLs** field (e.g. a filtered category page)
3. Optionally set a **Start Date** to only get offers published after that date
4. Optionally configure **Telegram Bot Token** and **Chat ID** to receive notifications
5. Click **Start** and wait for results

## Input

| Field              | Type   | Required | Description                                             |
| ------------------ | ------ | -------- | ------------------------------------------------------- |
| URLs               | array  | Yes      | Cyklobazar URLs to scrape (category pages with filters) |
| Start Date         | string | No       | Only scrape offers after this date (YYYY-MM-DD)         |
| Telegram Bot Token | string | No       | Bot token from @BotFather for notifications             |
| Telegram Chat ID   | string | No       | Chat ID to send notifications to                        |

## Output

The scraper produces a dataset with the following fields:

| Field       | Description                           |
| ----------- | ------------------------------------- |
| title       | Offer title                           |
| price       | Price as displayed (e.g. "23 000 Kc") |
| location    | Seller location                       |
| created     | Date the offer was published          |
| description | Offer description text                |
| url         | Direct link to the offer              |

Example output:

```json
{
    "title": "GHOST ASKET ADVANCED 2023",
    "price": "23 000 Kc",
    "location": "Praha",
    "created": "Vytvoreno 15. 4. 2026, 10:32",
    "description": "Gravel bike in excellent condition...",
    "url": "https://www.cyklobazar.cz/inzerat/dAD0l6Q1xN3rK/ghost-asket-advanced-2023"
}
```

## Telegram notifications

The scraper tracks which offers have already been sent and only notifies you about new ones. This makes it ideal for running on a schedule (e.g. every hour) to monitor new listings.

To set up:

1. Create a bot via [@BotFather](https://t.me/BotFather) on Telegram
2. Send a message to your bot
3. Get your chat ID from `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. Enter the token and chat ID in the Actor input
