"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/* Deploy is now the Publish panel inside each assistant's editor
   (/app/assistants/<id>) — this stub keeps old bookmarks working. */
export default function DeployRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/app/assistants");
  }, [router]);
  return null;
}
