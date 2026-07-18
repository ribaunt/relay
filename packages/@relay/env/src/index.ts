export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === "production"
}

export function getRequired(name: string, fallback?: string): string {
  const value = process.env[name]
  if (!value) {
    if (!isProductionEnvironment() && fallback) {
      return fallback
    }
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value
}

export function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  return normalized === "1" || normalized === "true" || normalized === "yes"
}

export function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
