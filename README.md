# Table Agent

Restaurant reservation agent demo for the Call My Agent Hackathon.

The app is a Next.js local web demo with safe-by-default integrations:

- Apify for restaurant discovery and reservation availability actors.
- Browser Use for website and booking-form inspection.
- AgentPhone for phone-call fallback and SMS confirmation previews.
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

## Safety model

The app works end to end in dry-run mode. Real quota-spending or real-world actions stay disabled unless these are set:

```env
ALLOW_APIFY_LIVE_RUN=true
ALLOW_BROWSER_USE_LIVE_TASK=true
ALLOW_REAL_RESTAURANT_CALLS=true
ALLOW_REAL_SMS_SEND=true
ALLOW_REAL_EMAIL_SEND=true
ALLOW_REAL_BOOKING_SUBMIT=true
```

For the hackathon demo, keep `ALLOW_REAL_BOOKING_SUBMIT=false` until a human approves the final booking details.

## Demo flow

1. Enter a dinner request.
2. The agent parses the request.
3. It discovers restaurants through cache/Apify.
4. It checks booking paths through Browser Use dry-run/live mode.
5. It ranks options.
6. Select a restaurant and execute the booking plan.
7. The app generates phone, email, SMS, and memory actions.

## Verification

```bash
npm run verify
npm run verify:browser
```

`verify` runs TypeScript checks, unit tests, and a production build. `verify:browser` expects the dev server to already be running and exercises the main browser flow.
