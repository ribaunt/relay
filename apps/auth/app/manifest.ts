import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "relay-auth",
    name: "Relay Auth",
    short_name: "Relay Auth",
    description: "End-to-end encrypted TOTP authenticator",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    shortcuts: [
      {
        name: "Add account",
        short_name: "Add",
        description: "Scan a QR code or enter a key",
        url: "/?action=add",
      },
      {
        name: "Settings",
        short_name: "Settings",
        description: "Open Relay Auth settings",
        url: "/settings",
      },
    ],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-maskable.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  }
}
