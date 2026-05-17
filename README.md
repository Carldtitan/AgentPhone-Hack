# Table Agent

Restaurant reservation agent for the Call My Agent Hackathon.

The app is a Next.js local web app with live integrations:

- Apify for restaurant discovery and reservation availability actors.
- Browser Use for live website and booking-form automation.
- AgentPhone is present but disabled in the current flow so no restaurant or phone-number calls are made.
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

The local `.env` can run live tools. The current checked flow excludes phone calling and SMS.

These toggles control live behavior:

```env
ALLOW_APIFY_LIVE_RUN=true
ALLOW_BROWSER_USE_LIVE_TASK=true
ALLOW_REAL_RESTAURANT_CALLS=false
ALLOW_REAL_SMS_SEND=false
ALLOW_REAL_EMAIL_SEND=true
ALLOW_REAL_BOOKING_SUBMIT=true
```

Browser Use is instructed to stop if a deposit, credit card, login, phone call, or unclear policy appears. After a booking run, the app shows an "Open Browser Use live session" link plus an embedded viewer and a "Stop session" button.

## Demo flow

1. Enter a dinner request.
2. The agent parses the request.
3. It discovers restaurants through cache/Apify.
4. It checks booking paths through Browser Use dry-run/live mode.
5. It ranks options.
6. Select a restaurant and execute the booking plan.
7. The app starts a live Browser Use session, skips phone/SMS, sends AgentMail email, and writes Supermemory context.

## Verification

```bash
npm run verify
npm run verify:browser
```

`verify` runs TypeScript checks, unit tests, and a production build. `verify:browser` expects the dev server to already be running and exercises the browser search flow. Set `VERIFY_LIVE_BOOKING=true` to include the live Browser Use action; the verifier checks the live-session link and then stops the Browser Use session by default. It does not trigger phone calls.
