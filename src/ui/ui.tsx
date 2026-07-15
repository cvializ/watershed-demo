import type { GameWorld } from "@/types";
import { GameUI } from "@/ui/GameUI";
import { createRoot } from "react-dom/client";

const uiContainer = document.getElementById("ui-root");

if (!uiContainer) {
  throw new Error("UI root element not found");
}

let uiRoot = createRoot(uiContainer);

export function initGameUI() {
  // React UI is already mounted, this is here for future initialization logic
  console.log("Game UI initialized");
}

export function renderGameUI(world: GameWorld) {
  uiRoot.render(<GameUI world={world}/>);
}