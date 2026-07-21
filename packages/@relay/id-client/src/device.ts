import { initSodium } from "@relay/crypto";
import type {
  DeviceRegistrationRequest,
  DeviceRegistrationResponse,
  DeviceInfo
} from "./types";

export async function generateDeviceKeys(): Promise<{
  x25519PrivateKey: string;
  x25519PublicKey: string;
  ed25519PrivateKey: string;
  ed25519PublicKey: string;
}> {
  const sodium = await initSodium();

  const x25519KeyPair = sodium.crypto_kx_keypair();
  const ed25519KeyPair = sodium.crypto_sign_keypair();

  return {
    x25519PrivateKey: sodium.to_base64(x25519KeyPair.privateKey),
    x25519PublicKey: sodium.to_base64(x25519KeyPair.publicKey),
    ed25519PrivateKey: sodium.to_base64(ed25519KeyPair.privateKey),
    ed25519PublicKey: sodium.to_base64(ed25519KeyPair.publicKey)
  };
}

export async function registerDevice(
  baseUrl: string,
  request: DeviceRegistrationRequest
): Promise<DeviceRegistrationResponse> {
  const res = await fetch(`${baseUrl}/api/devices/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });

  if (!res.ok) {
    throw new Error("Device registration failed");
  }

  return res.json();
}

export async function listDevices(
  baseUrl: string
): Promise<DeviceInfo[]> {
  const res = await fetch(`${baseUrl}/api/devices`, {
    headers: { "Content-Type": "application/json" }
  });

  if (!res.ok) {
    throw new Error("Failed to list devices");
  }

  const data = await res.json();
  return data.devices;
}

export async function renameDevice(
  baseUrl: string,
  deviceId: string,
  name: string
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/devices/${deviceId}/rename`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });

  if (!res.ok) {
    throw new Error("Device rename failed");
  }
}

export async function revokeDevice(
  baseUrl: string,
  deviceId: string
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/devices/${deviceId}/revoke`, {
    method: "POST"
  });

  if (!res.ok) {
    throw new Error("Device revocation failed");
  }
}