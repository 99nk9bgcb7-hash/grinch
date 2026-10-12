# Grinchmas

The finished calendar is **index.html**. All illustrations, fonts, styles and game logic are embedded in this one file. Open it in a browser or put it on a static host; the calendar does not need external assets or an internet connection. The original uploaded file is preserved separately.

## Playing together

Take turns on **one shared device and browser**. Pick any unopened window. Once opened, a window stays visibly open, displays its result and is disabled for everyone using that browser, including after a reload. There are no gift counters or progress bars.

A losing window displays the Grinch and a playful caption without announcing another attempt. Its central button closes the popup; the player can then pick another unopened window. The losing window stays open and disabled. A loss does not consume or automatically reserve the next real gift.

The original inventory contains 34 real gifts, including duplicates, and three losing events. Only the ordinary physical gifts shuffle among their original positions. Each new window receives the next event from the queue. All real gifts remain available regardless of which window numbers are chosen. After every event has been revealed, three unassigned mystery windows remain closed and display a note from the Grinch if clicked; they do not contain additional prizes.

The interface, popup captions, buttons, accessibility labels and notices are all in English. Every window popup includes its window number and a themed Grinch illustration. Decorations and accent colours vary by gift. Gift popups close with their central labelled button, Escape or a click outside; there are no close icons.

## Saved games

- Progress is saved in this browser's `localStorage`. Other tabs on the same origin update automatically. Web Locks prevent simultaneous clicks in those tabs from awarding the same window twice.
- This is a shared-device calendar, not a server-backed game that synchronizes different phones or browsers. Use the same browser and URL throughout the event.
- Existing version 4 games upgrade automatically. Previously awarded gifts stay assigned to their original windows and become visibly open. Pranks that were already bundled with those gifts are not issued again. The legacy save remains available as a backup.
- If browser storage is blocked, the calendar keeps its state in the current tab and displays an English notice. Keep the tab open in that case.
- **Restart → Restart calendar** clears the current game and closes all windows. Choose **Keep playing** to cancel. Restart is available in the header on desktop and mobile.

## Development

Edit `src/index.template.html`, `src/style.css` and `src/game.js`, then rebuild:

```sh
python3 build.py
python3 -m http.server 8000 --bind 127.0.0.1
```

The illustrations and local fonts are in `assets/`, along with the font licenses. The illustrations were generated for this calendar using the supplied visual reference. Popup art uses a 4×4 atlas and a supplemental 2×2 atlas for SPA, Alza, Ambiente and Rituals, rendered with CSS. Michelin and Mini fan retain their original illustrations. Sephora uses gold accents and neutral captions; its existing illustration remains unchanged.

Use the existing checkout. Cloud tasks already run in isolation; an additional Git worktree is unnecessary.

## Checks

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

The browser test uses `/usr/bin/chromium` if installed, or Playwright's browser otherwise. Set `CHROMIUM_PATH` to use another executable. The test starts and stops its own temporary HTTP server.

Coverage includes the complete gift inventory across different window orders, permanent opened states, disabled repeat picks, losses followed by a fresh pick, migration of existing saves, reloads, concurrent same-window picks, tab synchronization, every popup at six viewport sizes, keyboard access and offline operation.
