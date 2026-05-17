# Demo Env Requirements

Required for a full live demo:

1. `GEMINI_API_KEY`
   - Get it from Google AI Studio.
   - Default model: `gemini-2.5-flash-lite`.

2. `BROWSER_USE_API_KEY`
   - Get it from Browser Use Cloud settings.
   - Used for hosted browser automation and the Browser Use MCP.

3. `APIFY_TOKEN`
   - Get it from Apify Console API & Integrations.
   - Used for restaurant scrapers and reservation availability actors.
   - Recommended actors:
     - `compass/crawler-google-places`
     - `clearpath/resy-api`
     - `canadesk/opentable`
     - `junipr/yelp-scraper`
     - `REDACTED`

4. `AGENTPHONE_API_KEY`
   - Get it from AgentPhone settings.
   - Required for real SMS and restaurant phone calls.
   - Also provide `AGENTPHONE_FROM_NUMBER` after provisioning a number.

5. `AGENTMAIL_API_KEY`
   - Get it from AgentMail Console.
   - Required for real confirmation emails.
   - Also provide `AGENTMAIL_INBOX_ID` after creating an inbox.

Optional but useful:

1. `SUPERMEMORY_API_KEY`
   - Used to remember user dining preferences.

2. `YELP_API_KEY`
   - Optional fallback if Apify is unavailable or if you want direct Yelp Fusion search.

3. `DEMO_TEST_RECIPIENT_EMAIL`
   - Email address to receive test confirmations.

4. `DEMO_TEST_RECIPIENT_PHONE`
   - Phone number to receive test SMS/call flows.

Safety toggles:

1. Keep `ALLOW_REAL_RESTAURANT_CALLS=false` until the demo script is ready.
2. Keep `ALLOW_REAL_SMS_SEND=false` until the phone number is verified.
3. Keep `ALLOW_REAL_EMAIL_SEND=false` until the AgentMail inbox is verified.
4. Keep `ALLOW_REAL_BOOKING_SUBMIT=false` unless a human has explicitly approved the final booking.
5. Keep `ALLOW_APIFY_LIVE_RUN=false` unless you want to spend Apify credits on a fresh scrape.
6. Keep `ALLOW_BROWSER_USE_LIVE_TASK=false` unless you want Browser Use to start a cloud browser task.

MCP notes:

1. Browser Use hosted MCP URL: `https://api.browser-use.com/v3/mcp`.
2. AgentPhone MCP uses `npx -y agentphone-mcp`.
3. AgentMail MCP URL: `https://mcp.agentmail.to/mcp`.
4. Supermemory MCP URL: `https://mcp.supermemory.ai/mcp`.
5. Apify hosted MCP URL: `https://mcp.apify.com`.
6. OpenTable Booker MCP URL: `https://clearpath--opentable-booker.apify.actor/mcp`.
7. Resy Booker MCP URL: `https://clearpath--resy-booker.apify.actor/mcp`.
