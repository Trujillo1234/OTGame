import type { Metadata } from "next";
import { headers } from "next/headers";
import { PennRunGame } from "../PennRunGame";
import "../PennRunGame.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;
  const title = "Penn Run — Penelope’s Tiny Denver Grand Prix";
  const description =
    "Choose Emmy’s little car or running Opie and race from 935 Penn to Trader Joe’s, the Capitol, around Cheesman Park, and home.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: "Penn Run — choose Emmy’s little car or running Opie",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function PennRunPage() {
  return <PennRunGame />;
}
