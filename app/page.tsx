import type { Metadata } from "next";
import Link from "next/link";
import "./game-hub.css";

export const metadata: Metadata = {
  title: "Emmy & Opie Arcade",
  description:
    "Choose a Denver neighborhood race or a playful Emmy vs. Opie fighting game.",
};

const games = [
  {
    href: "/penn-run",
    eyebrow: "3D NEIGHBORHOOD RACE",
    title: "Penn Run",
    description:
      "Race Emmy’s little car or run as Opie from Penn to Trader Joe’s, the Capitol, Cheesman Park, and home.",
    image: "/og.png",
    accent: "race",
    action: "START RACING",
  },
  {
    href: "/denver-fight-club",
    eyebrow: "2D ARCADE FIGHTER",
    title: "Denver Fight Club",
    description:
      "Pick Emmy’s pink BJJ power or Opie’s fencing skills and battle across colorful Denver arenas.",
    image: "/games/otgame/og-denver-fight-club.png",
    accent: "fight",
    action: "START FIGHTING",
  },
] as const;

export default function GameHub() {
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
          <Link
            className="game-title-card"
            data-accent={game.accent}
            href={game.href}
            key={game.href}
          >
            <span className="game-number">0{index + 1}</span>
            <span className="game-art">
              {/* eslint-disable-next-line @next/next/no-img-element */}
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
          </Link>
        ))}
      </section>

      <footer className="hub-footer">
        MADE WITH LOVE IN CAPITOL HILL · KEYBOARD + TOUCH READY
      </footer>
    </main>
  );
}
