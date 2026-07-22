#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { execSync } from "node:child_process"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, "..")

const ID_ENV_DEFAULTS = {
  SITE_URL: "http://localhost:3001",
  RELAY_SERVICE_AUTH_ORIGIN: "http://localhost:3000",
  BETTER_AUTH_SECRET: null, // generated once if missing
  OIDC_JWKS_ACTIVE_KID: "dev-key-1",
  POSTHOG_KEY: "phc_placeholder",
}

const AUTH_ENV_DEFAULTS = {
  RELAY_SERVICE_ID_ORIGIN: "http://localhost:3001",
  RELAY_SESSION_SECRET: "dev-relay-auth-session-secret-not-for-production",
}

function run(cmd, options = {}) {
  return execSync(cmd, { encoding: "utf-8", ...options }).trim()
}

function readLines(path) {
  if (!existsSync(path)) return []
  return readFileSync(path, "utf-8").split("\n")
}

function writeLines(path, lines) {
  writeFileSync(path, lines.join("\n"))
}

function setVar(lines, key, value) {
  const prefix = `${key}=`
  const idx = lines.findIndex((l) => l.startsWith(prefix) && !l.startsWith("#"))
  const entry = `${prefix}${value}`

  if (idx !== -1) {
    if (lines[idx] === entry) return false
    lines[idx] = entry
    return true
  }

  lines.push(entry)
  return true
}

function setAfterComment(lines, key, value, commentMarker) {
  const prefix = `${key}=`
  const exists = lines.find((l) => l.startsWith(prefix))
  if (exists) return false

  const commentIdx = lines.findIndex((l) => l.includes(commentMarker))
  const entry = `${key}=${value}`
  if (commentIdx !== -1) {
    lines.splice(commentIdx + 1, 0, entry)
  } else {
    lines.push(entry)
  }
  return true
}

function ensureKeyPair(lines, keyPrefix) {
  const hasPriv = lines.some((l) => l.startsWith(`${keyPrefix}_PRIVATE_KEY_PEM=`))
  if (hasPriv) return false

  const privKey = run("openssl genrsa 2048")
  const privPkcs8 = run("openssl pkcs8 -topk8 -nocrypt", { input: privKey })
  const pub = run("openssl pkey -pubout", { input: privKey })
  lines.push(`${keyPrefix}_PRIVATE_KEY_PEM=${privPkcs8.replace(/\n/g, "\\n")}`)
  lines.push(`${keyPrefix}_PUBLIC_KEY_PEM=${pub.replace(/\n/g, "\\n")}`)
  return true
}

let changed = false

function ensureVar(lines, key, value) {
  const prefix = `${key}=`
  const exists = lines.some((l) => l.startsWith(prefix) && !l.startsWith("#"))
  if (exists) return false
  lines.push(`${key}=${value}`)
  return true
}

// ── relay-id ───────────────────────────────────────────────────────
let idLines = readLines(resolve(root, "apps/id/.env.local"))

for (const [key, value] of Object.entries(ID_ENV_DEFAULTS)) {
  if (value !== null) {
    if (setVar(idLines, key, value)) changed = true
  } else {
    if (ensureVar(idLines, key, run("openssl rand -base64 32"))) changed = true
  }
}

if (ensureKeyPair(idLines, "OIDC_ACCESS_TOKEN")) changed = true
if (ensureKeyPair(idLines, "OIDC_ID_TOKEN")) changed = true

writeLines(resolve(root, "apps/id/.env.local"), idLines)

// ── relay-auth ─────────────────────────────────────────────────────
let authLines = readLines(resolve(root, "apps/auth/.env.local"))

for (const [key, value] of Object.entries(AUTH_ENV_DEFAULTS)) {
  if (setVar(authLines, key, value)) changed = true
}

writeLines(resolve(root, "apps/auth/.env.local"), authLines)

if (changed) {
  console.log("✓ Keys and env vars generated")
} else {
  console.log("✓ All keys and env vars already present")
}
