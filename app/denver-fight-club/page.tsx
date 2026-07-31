import type { Metadata } from "next";
import { headers } from "next/headers";
import { OTGame } from "../otgame/OTGame";
import "../otgame/otgame.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/games/otgame/og-denver-fight-club.png`;
  const title = "Denver Fight Club - Emmy vs. Opie";
  const description =
    "Jump, combo, transform, and unleash Emmy's pink BJJ power or Opie's blue fencing power.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function DenverFightClubPage() {
  return <OTGame />;
}
