import { describe, it, expect } from "vitest";
import {
  bytesToBase64Url,
  base64UrlToBytes,
  bytesToHex,
  encodeUtf8,
  decodeUtf8,
} from "./utils";

describe("bytesToBase64Url", () => {
  it("encodes bytes to base64url", () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]);
    expect(bytesToBase64Url(bytes)).toBe("SGVsbG8");
  });

  it("handles empty input", () => {
    expect(bytesToBase64Url(new Uint8Array())).toBe("");
  });
});

describe("base64UrlToBytes", () => {
  it("decodes base64url to bytes", () => {
    const result = base64UrlToBytes("SGVsbG8");
    expect(Array.from(result)).toEqual([72, 101, 108, 108, 111]);
  });

  it("roundtrips correctly", () => {
    const original = new Uint8Array([0, 255, 128, 64, 32, 16, 8, 4, 2, 1]);
    const encoded = bytesToBase64Url(original);
    const decoded = base64UrlToBytes(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });
});

describe("bytesToHex", () => {
  it("encodes bytes to hex", () => {
    const bytes = new Uint8Array([0, 255, 128, 72, 101]);
    expect(bytesToHex(bytes)).toBe("00ff804865");
  });
});

describe("encodeUtf8 / decodeUtf8", () => {
  it("roundtrips a string", () => {
    const original = "Hello, 世界!";
    const encoded = encodeUtf8(original);
    const decoded = decodeUtf8(encoded);
    expect(decoded).toBe(original);
  });

  it("handles empty string", () => {
    expect(Array.from(encodeUtf8(""))).toEqual([]);
    expect(decodeUtf8(new Uint8Array())).toBe("");
  });
});