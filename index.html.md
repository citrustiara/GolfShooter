# Golf Duel - Codebase Structure

The project has been refactored into modular components to improve maintainability and scalability.

## File Structure

- `index.html`: The entry point. Loads all styles and modules.
- `css/style.css`: All game styles, including UI and HUD overlays.
- `js/`:
    - `core/`:
        - `constants.js`: Global configuration and game-tuning constants.
        - `engine.js`: Three.js setup (renderer, scene, camera, lighting, materials).
        - `state.js`: Global game state management (`game`, `input`, `world`, `fps`).
        - `utils.js`: Helper functions for math, screen projection, and audio.
        - `network.js`: P2P networking logic using PeerJS.
    - `golf/`:
        - `catalog.js`: Definitions for all golf holes.
        - `logic.js`: Golf-specific physics, course building, and scoring logic.
    - `fps/`:
        - `themes.js`: Arena visual themes and bounds.
        - `logic.js`: FPS movement, arena construction, and player mesh generation.
- `FEATURES_PLAN.md`: A detailed roadmap for upcoming features.

## How to Run

Simply open `index.html` in a modern web browser. The game uses ES Modules, so it must be served via a local server (e.g., `Live Server` in VS Code) for imports to work correctly.

## Architecture

The game uses a single-loop architecture with phases (`menu`, `lobby`, `golf`, `fps`, `result`). Transitions between phases are handled by updating the `game.phase` state and calling reset functions for the respective modules.
Network synchronization is achieved by sending state snapshots and events over PeerJS DataChannels.
