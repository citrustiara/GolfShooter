# Vendored Desktop Runtime

These files are pinned copies of the browser runtime dependencies used by the
Pake desktop build.

- Three.js 0.164.1 from `three`
- PeerJS 1.5.5 from `peerjs`

The source app imports these files locally so the packaged desktop app can start
without pulling JavaScript modules from a CDN. Multiplayer still needs network
access for PeerJS discovery and WebRTC/STUN connectivity.
