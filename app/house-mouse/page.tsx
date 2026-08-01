import type { Metadata } from "next";
import { HouseMouseGame } from "./HouseMouseGame";
import "./house-mouse.css";

export const metadata: Metadata = {
  title: "House Mouse — Emmy & Opie Arcade",
  description: "Race around the real house at mouse scale as Emmy or Opie.",
};

export default function HouseMousePage() {
  return <HouseMouseGame />;
}
