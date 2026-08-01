import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PennRunGame } from "../app/PennRunGame";
import { OTGame } from "../app/otgame/OTGame";
import { HouseMouseGame } from "../app/house-mouse/HouseMouseGame";
import "../app/PennRunGame.css";
import "../app/otgame/otgame.css";
import "../app/house-mouse/house-mouse.css";
import "../app/game-hub.css";
import "./pages.css";

const base = "/OTGame";

const games = [
  {
    href: `${base}/penn-run/`,
    eyebrow: "3D NEIGHBORHOOD RACE",
    title: "Penn Run",
    description:
      "Race Emmy’s little car or run as Opie from Penn to Trader Joe’s, the Capitol, Cheesman Park, and home.",
    image: `${base}/og.png?v=20260731-3`,
    accent: "race",
    action: "START RACING",
  },
  {
    href: `${base}/denver-fight-club/`,
    eyebrow: "2D ARCADE FIGHTER",
    title: "Denver Fight Club",
    description:
      "Pick Emmy’s pink BJJ power or Opie’s fencing skills and battle across colorful Denver arenas.",
    image: `${base}/games/otgame/og-denver-fight-club.png?v=20260731-3`,
    accent: "fight",
    action: "START FIGHTING",
  },
] as const;

function GameHub() {
  return (
    <main className="game-hub">
      <div className="hub-sky" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <header className="hub-header">
        <span className="hub-kicker">TWO SISTERS · TWO GAMES · ONE DENVER</span>
        <h1>
          Emmy &amp; Opie
          <strong>Arcade</strong>
        </h1>
        <p>Pick a title card and jump straight into the action.</p>
      </header>
      <section className="game-grid" aria-label="Choose a game">
        {games.map((game, index) => (
          <a
            className="game-title-card"
            data-accent={game.accent}
            href={game.href}
            key={game.href}
          >
            <span className="game-number">0{index + 1}</span>
            <span className="game-art">
              <img src={game.image} alt="" />
              <span className="game-art-shade" />
              <span className="game-eyebrow">{game.eyebrow}</span>
            </span>
            <span className="game-copy">
              <strong>{game.title}</strong>
              <span>{game.description}</span>
              <b>
                {game.action} <i aria-hidden="true">↗</i>
              </b>
            </span>
          </a>
        ))}
      </section>
      <footer className="hub-footer">
        MADE WITH LOVE IN CAPITOL HILL · KEYBOARD + TOUCH READY
      </footer>
    </main>
  );
}

function App() {
  const path = window.location.pathname
    .replace(/^\/OTGame/, "")
    .replace(/\/+$/, "");

  if (path === "/penn-run") {
    document.title = "Penn Run — Tiny Denver Grand Prix";
    return <PennRunGame />;
  }
  if (path === "/house-mouse") {
    document.title = "House Mouse — Race Around Home";
    return <HouseMouseGame />;
  }
  if (path === "/denver-fight-club" || path === "/otgame") {
    document.title = "Denver Fight Club — Emmy vs. Opie";
    return <OTGame />;
  }
  document.title = "Emmy & Opie Arcade";
  return <GameHub />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
