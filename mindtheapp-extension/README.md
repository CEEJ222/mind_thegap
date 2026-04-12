# Mind the App — Chrome extension

Companion Chrome extension for [jobseek.fyi](https://jobseek.fyi). Detects job
postings on supported ATS platforms, runs AI-powered gap analysis, and
generates tailored resumes — all from the browser side panel.

## Tech stack

- Chrome Manifest V3
- React 18 + TypeScript + Vite
- Tailwind CSS (warm cream `#F5EDDC` / turquoise `#3DD9B3`, DM Sans)
- shadcn-style UI primitives (Button, Card, TierBadge)

## Supported ATS

| ATS | Status |
| --- | --- |
| Greenhouse (`boards.greenhouse.io`) | ✅ |
| Lever (`jobs.lever.co`) | ✅ |
| Ashby (`app.ashbyhq.com`) | 🚧 stubbed |
| LinkedIn (`linkedin.com/jobs`) | 🚧 stubbed |
| Generic pages | ✅ fallback |

## Development

```bash
npm install
npm run dev      # vite build --watch
npm run build    # production build -> dist/
npm run typecheck
npm run zip      # package dist/ as mindtheapp-extension.zip
```

### Load unpacked in Chrome

1. `npm run build`
2. Open `chrome://extensions`
3. Toggle **Developer mode**
4. Click **Load unpacked** → select the `dist/` directory

## Auth flow

1. User clicks **Sign in to jobseek.fyi** in the side panel
2. Background opens `https://jobseek.fyi/auth?extension=true` in a new tab
3. Web app signs the user in and posts the session token back:
   ```js
   chrome.runtime.sendMessage(EXTENSION_ID, {
     type: "AUTH_SUCCESS",
     token: session.access_token,
   });
   ```
4. Background stores the token in `chrome.storage.local` and closes the auth tab
5. Side panel re-hydrates and shows the authenticated state

The web app will need the extension ID as `NEXT_PUBLIC_MINDTHEAPP_EXTENSION_ID`
(or similar) env var so it knows where to route the `sendMessage` call.

## Project layout

```
mindtheapp-extension/
├── manifest.json
├── vite.config.ts
├── src/
│   ├── sidepanel/       # React side panel UI
│   ├── content/         # Content scripts (ATS detection, auth bridge)
│   ├── background/      # Service worker
│   ├── lib/             # api, auth, jd-extractor, types, cn
│   └── components/ui/   # shadcn-style primitives
└── public/icons/        # Extension icons (placeholder)
```
