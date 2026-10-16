# French and English

On the first visit, `initializeLanguage()` uses the browser locale immediately, then asks [GeoJS for the connection's country](https://www.geojs.io/docs/v1/endpoints/country/). `FR` selects French; every other valid country selects English, including French-speaking countries outside France. This is an estimate from the connection's IP, so a VPN can change the detected country. No location permission or precise coordinates are requested. The response's IP is discarded; only the country code is cached in session storage for one hour.

An explicit choice from the home page or game settings is stored under `money-tour.language.v1` and always wins, including during a pending detection request. A request times out after 2.5 seconds. If it fails, is blocked or returns invalid data, the browser locale remains active and the game remains playable. With browser storage disabled, language changes still work for the current visit. Each online player has their own language; changing it neither changes the room language nor resets a game or a pending decision.

## Maintaining copy

- French is the canonical source. The English catalogue is `apps/web/src/i18n/en.json`; the credits have a separate `CREDITS.en.md` version.
- Use `translate(source)` for display labels and canonical descriptions. Use `formatText('Source {0}', value)` for interpolation, passing player names unchanged and translating game labels explicitly.
- Translate at render time. Do not translate saved rules, card IDs, property names inside authoritative state, network messages, hashes or decision values. The game engine and its protocol remain language independent.
- Historical journals and shared engine notices contain canonical French sentences. Anchored catalogue templates translate these on display. `messageSlots` explicitly identifies nested game descriptions and city names that can be translated. All other template values remain opaque so player names cannot be replaced by dictionary words.
- Format numbers using `numberLocale()`. Search accepts both canonical and translated city/street names.

## Verification

`pnpm check` runs type checking, lint, engine coverage, tests, production build and asset/model checks. `language.test.ts` verifies country selection, fallback, timeout, manual priority, persistence, race handling, complete current cards/tutorial text, unchanged game state and a live language switch during a purchase.

`pnpm qa:language` starts a local Vite server and runs browser acceptance. It captures home, settings, rules, tutorial, online-room validation, game menus and decision scenes; checks horizontal overflow and clipped controls; and reports untranslated catalogue text. Defaults: Chromium at 320×740, 390×844, 844×390, 768×1024 and 1440×1000. Language detection is simulated by intercepting only GeoJS responses; all game rendering and interactions run in the browser.

Environment options: `LANGUAGE_QA_BROWSERS=chromium,webkit`, `LANGUAGE_QA_SIZES=390x844,844x390`, `LANGUAGE_QA_SCENES=purchase,auction,duel`, `LANGUAGE_QA_SCENARIOS_ONLY=1`, `LANGUAGE_QA_OUT=artifacts/language-qa`, and `LANGUAGE_QA_URL` to reuse a local server. Review screenshots as well as geometry results; automated checks do not prove physical-device or Safari/iOS behaviour.
