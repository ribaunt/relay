import _sodium from "libsodium-wrappers-sumo"

export type SodiumModule = typeof _sodium

export const initSodium = async (): Promise<SodiumModule> => {
  await _sodium.ready
  return _sodium
}

export const KDF_PARAMS = {
  MEM_LIMIT: 134217728,
  OPS_LIMIT: 3,
  KEY_LENGTH: 32,
} as const

export const KDF_PARAMS_RECOMMENDED = {
  MEM_LIMIT: 268435456,
  OPS_LIMIT: 4,
  KEY_LENGTH: 32,
} as const
