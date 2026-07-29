import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PennRunGame } from "./PennRunGame";
import "./index.css";
import "./PennRunGame.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PennRunGame />
  </StrictMode>,
);
