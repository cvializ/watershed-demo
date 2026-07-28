import { createRoot } from "react-dom/client";

import { GameUI } from "@/ui/GameUI";
import type { GameWorldContext } from "@/context";

const uiContainer = document.getElementById("ui-root");

if (!uiContainer) {
  throw new Error("UI root element not found");
}

let uiRoot = createRoot(uiContainer);

export function initGameUI() {
  // React UI is already mounted, this is here for future initialization logic
  console.log("Game UI initialized");
}

export function renderGameUI(world: GameWorldContext) {
  uiRoot.render(<GameUI world={world} />);
}
