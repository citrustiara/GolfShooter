# GolfShooter

A single-file browser game that starts as relaxed 3D mini golf and snaps into
an FPS deathmatch when the golf card ends in a tie.

## Run

Serve the folder with any static server and open `index.html`.

```powershell
python -m http.server 4173
```

Then visit `http://localhost:4173`.

## Multiplayer

The page uses PeerJS cloud discovery with a shared room phrase. The host creates
a phrase, the guest joins with the same phrase, and gameplay data moves directly
over the browser-to-browser WebRTC connection after discovery.

The app has no database, account system, or matchmaking backend. It can be
hosted from any static file host that allows CDN scripts.
