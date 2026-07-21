import { SRPRoutines, SRPParameters } from "tssrp6a";
import type { SRPClientSession, SRPLoginResult } from "./types";

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function bigIntToArrayBuffer(value: bigint): ArrayBuffer {
  const hex = value.toString(16).padStart(2, "0");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes.buffer;
}

function arrayBufferToBigInt(buffer: ArrayBuffer): bigint {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return BigInt("0x" + hex);
}

const routines = new SRPRoutines(new SRPParameters()) as any;

export async function beginSRPClientSession(
  email: string,
  password: string
): Promise<SRPClientSession> {
  const { SRPClientSession: SRPClient } = await import("tssrp6a");
  const client = new SRPClient(routines);
  const step1: any = await client.step1(email, password);
  const clientPublicEphemeral = arrayBufferToBase64(bigIntToArrayBuffer(step1.A));

  return {
    clientPublicEphemeral,
    step2: async (srpSalt: string, serverPublicEphemeral: string) => {
      const saltBigInt = arrayBufferToBigInt(base64ToArrayBuffer(srpSalt));
      const serverBigInt = arrayBufferToBigInt(base64ToArrayBuffer(serverPublicEphemeral));
      const step2: any = await step1.step2(saltBigInt, serverBigInt);

      return {
        clientPublicEphemeral: arrayBufferToBase64(bigIntToArrayBuffer(step2.A)),
        clientProof: arrayBufferToBase64(bigIntToArrayBuffer(step2.M1)),
      };
    },
  };
}

export async function srpInitiate(
  baseUrl: string,
  email: string,
  clientPublicEphemeral: string
): Promise<{ srpSalt: string; serverPublicEphemeral: string }> {
  const res = await fetch(`${baseUrl}/api/srp/initiate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, clientPublicEphemeral }),
  });

  if (!res.ok) {
    throw new Error("SRP initiate failed");
  }

  const data = await res.json();
  return {
    srpSalt: data.srpSalt,
    serverPublicEphemeral: data.serverPublicEphemeral,
  };
}

export async function srpComplete(
  baseUrl: string,
  email: string,
  clientPublicEphemeral: string,
  clientProof: string,
  deviceInfo?: {
    deviceId: string;
    name: string;
    platform?: string;
    os?: string;
    appVersion?: string;
    devicePublicKey?: string;
    signingPublicKey?: string;
    pushToken?: string;
  }
): Promise<SRPLoginResult> {
  const body: Record<string, unknown> = {
    email,
    clientPublicEphemeral,
    clientProof,
  };

  if (deviceInfo) {
    body.deviceId = deviceInfo.deviceId;
    body.deviceName = deviceInfo.name;
    body.platform = deviceInfo.platform;
    body.os = deviceInfo.os;
    body.appVersion = deviceInfo.appVersion;
    body.devicePublicKey = deviceInfo.devicePublicKey;
    body.signingPublicKey = deviceInfo.signingPublicKey;
    body.pushToken = deviceInfo.pushToken;
  }

  const res = await fetch(`${baseUrl}/api/srp/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error("SRP complete failed");
  }

  const data = await res.json();
  return {
    sessionToken: data.sessionToken,
    encryptedMasterKey: data.encryptedMasterKey,
    iv: data.iv,
    kekSalt: data.kekSalt,
    kdfMemLimit: data.kdfMemLimit,
    kdfOpsLimit: data.kdfOpsLimit,
  };
}