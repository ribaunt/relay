"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"

type Settings = {
  hideEmail: boolean
  hideCodes: boolean
}

type SettingsContextValue = {
  settings: Settings
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}

const STORAGE_KEY = "relay-auth-settings"

const defaultSettings: Settings = {
  hideEmail: false,
  hideCodes: false,
}

function loadSettings(): Settings {
  if (typeof window === "undefined") return defaultSettings
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return { ...defaultSettings, ...parsed }
    }
  } catch {}
  return defaultSettings
}

function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {}
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings)

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  const updateSetting = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  return (
    <SettingsContext.Provider value={{ settings, updateSetting }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider")
  }
  return context
}
