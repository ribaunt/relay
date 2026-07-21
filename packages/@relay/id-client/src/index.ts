export {
  beginSRPClientSession,
  srpInitiate,
  srpComplete
} from "./srp";

export {
  exchangeAuthorizationCode,
  refreshAccessToken,
  revokeToken
} from "./oidc";

export { fetchBootstrap } from "./bootstrap";

export {
  generateDeviceKeys,
  registerDevice,
  listDevices,
  renameDevice,
  revokeDevice
} from "./device";

export type {
  SRPClientSession,
  SRPLoginResult,
  OIDCTokenResponse,
  BootstrapPayload,
  DeviceRegistrationRequest,
  DeviceRegistrationResponse,
  DeviceInfo,
  IdClientConfig
} from "./types";