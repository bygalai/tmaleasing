# GONKA Mini App (Frontend Only)

This repository contains only the Telegram Mini App client and UI.

## Stack

- React + TypeScript
- Vite
- Tailwind CSS
- Telegram Mini App SDK (`@telegram-apps/sdk-react`)

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Notes

- The app currently uses local demo listings in `src/hooks/useListings.ts`.
- Favorites are stored in browser `localStorage`.
