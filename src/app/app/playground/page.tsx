"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/* The Prompt Playground grew into the Assistants tab (multi-assistant
   builder with publish baked in) — this stub keeps old bookmarks and
   muscle memory working. */
export default function PlaygroundRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/app/assistants");
  }, [router]);
  return null;
}
