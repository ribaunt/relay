import type { BootstrapPayload } from "./types";

export async function fetchBootstrap(
  baseUrl: string,
  accessToken: string
): Promise<BootstrapPayload> {
  const res = await fetch(`${baseUrl}/api/relay/bootstrap`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error("Bootstrap fetch failed");
  }

  return res.json();
}