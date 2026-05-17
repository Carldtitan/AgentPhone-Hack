# Hackathon Demo Script

Use this prompt:

```text
Find and book Italian near REDACTED in San Francisco for 3 people tonight around 7:30pm, not too expensive, good for a team dinner.
```

Narration:

1. The user asks for dinner in natural language.
2. The agent parses party size, time, cuisine, budget, location, and preferences.
3. It searches cached/live restaurant data through Apify.
4. It checks reservation paths through Browser Use.
5. It ranks restaurants with deterministic scoring so the demo is stable.
6. The user chooses one.
7. The booking plan executes across Browser Use, AgentPhone, AgentMail, and Supermemory.

Current live behavior:

```text
The app uses live Gemini, Apify, Browser Use, AgentPhone, AgentMail, and Supermemory. Restaurant phone calls are redirected to REDACTED so the call flow can be tested without contacting a business.
```
