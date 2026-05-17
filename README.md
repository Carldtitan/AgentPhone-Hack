# Table Agent

Restaurant reservation agent for the Call My Agent Hackathon.

The app is a Next.js local web app with live integrations:

- Apify for restaurant discovery and reservation availability actors.
- Browser Use for website and booking-form inspection.
- AgentPhone for phone-call fallback redirected to a test phone.
- AgentMail for confirmation email sending.
- Supermemory for preference memory.
- Gemini for intent parsing when demo mode is disabled.

## Run locally

```bash
npm install
npm run env:check
npm run dev
```

Open `http://localhost:3000`.

## Live safety model

The local `.env` can run live tools. Restaurant phone calls are redirected to your test phone:

```env
RESTAURANT_CALL_TEST_OVERRIDE_PHONE=REDACTED
```

These toggles control live behavior:

```env
ALLOW_APIFY_LIVE_RUN=true
ALLOW_BROWSER_USE_LIVE_TASK=true
ALLOW_REAL_RESTAURANT_CALLS=true
ALLOW_REAL_SMS_SEND=true
ALLOW_REAL_EMAIL_SEND=true
ALLOW_REAL_BOOKING_SUBMIT=true
```

Browser Use is instructed to stop if a deposit, credit card, login, or unclear policy appears.

## Demo flow

1. Enter a dinner request.
2. The agent parses the request.
3. It discovers restaurants through cache/Apify.
4. It checks booking paths through Browser Use dry-run/live mode.
5. It ranks options.
6. Select a restaurant and execute the booking plan.
7. The app starts Browser Use, redirects the restaurant call to your phone, sends AgentMail email, and writes Supermemory context.

## Verification

```bash
npm run verify
npm run verify:browser
```

`verify` runs TypeScript checks, unit tests, and a production build. `verify:browser` expects the dev server to already be running and exercises the browser search flow. Set `VERIFY_LIVE_BOOKING=true` to include the live booking action; that can call your phone.
