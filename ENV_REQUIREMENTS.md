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
   - Set `RESTAURANT_CALL_TEST_OVERRIDE_PHONE=REDACTED` to redirect restaurant calls to your phone.

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

1. `ALLOW_REAL_RESTAURANT_CALLS=true` starts AgentPhone calls. With `RESTAURANT_CALL_TEST_OVERRIDE_PHONE` set, restaurant calls go to that number instead.
2. `ALLOW_REAL_EMAIL_SEND=true` sends AgentMail confirmation emails.
3. `ALLOW_REAL_BOOKING_SUBMIT=true` lets Browser Use attempt a real online booking, but the prompt stops at deposits, credit cards, login, or unclear policies.
4. `ALLOW_APIFY_LIVE_RUN=true` spends Apify credits on fresh restaurant data.
5. `ALLOW_BROWSER_USE_LIVE_TASK=true` starts Browser Use cloud browser sessions.
6. Outbound SMS may still require AgentPhone 10DLC/MCP messaging setup.

MCP notes:

1. Browser Use hosted MCP URL: `https://api.browser-use.com/v3/mcp`.
2. AgentPhone MCP uses `npx -y agentphone-mcp`.
3. AgentMail MCP URL: `https://mcp.agentmail.to/mcp`.
4. Supermemory MCP URL: `https://mcp.supermemory.ai/mcp`.
5. Apify hosted MCP URL: `https://mcp.apify.com`.
6. OpenTable Booker MCP URL: `https://clearpath--opentable-booker.apify.actor/mcp`.
7. Resy Booker MCP URL: `https://clearpath--resy-booker.apify.actor/mcp`.
