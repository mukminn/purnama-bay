# PURNAMA BAY

![make.fun gta6-01](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/mukminn/purnama-bay/rank.svg)
![reward](https://make.fun/badge/gta6-01/mukminn/purnama-bay/reward.svg)

An original open-world crime game for the make.fun **gta6-01** competition,
built with three.js and plain static files — no build step, no network
requests. You are **Raka Pradana**, a pier courier in the tropical coastal
city of Purnama Bay, framed by the **Kala Syndicate**. Take six jobs from
your contact **Mira Santoso**, earn clean PB$, and clear your name.

## Play

Serve the `game/` folder with any static file server and open
`game/index.html` in a desktop browser, or run `node serve.ts` and visit
http://localhost:8080. On a phone, hold it in landscape.

- **WASD** move · **Alt** walk · **Shift** sprint · **Space** jump / brake
- **C** crouch · **J** punch · **K** kick · **1/2/3** baton / pistol / fists
- **F** enter / exit car · **E** interact · **P** pause · **M** mute

## The laws of the bay

- Wanted stars rise **only** when a crime is witnessed: one witnessed crime
  is exactly one star, a continuing incident counts once, and the level
  never jumps by two. Hide crouched and unseen to cool off.
- Money enters the game **only** as mission rewards. Weapons come only
  from the **PURNAMA ARMS** shop or from fallen armed thugs.
- Children carry no health and can never be harmed, by anything.

## Contents

- `game/` — the game itself (three.js vendored under `game/vendor/`)
- `screenshots/` — four real renders of the game at 1280×720
- `main.ts` — the entry program that packs the dossier for make.fun
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged
