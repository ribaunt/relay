"use client"

import { useEffect, useState } from "react"

export default function CountdownBar({ period = 30 }: { period?: number }) {
  const [timeRemaining, setTimeRemaining] = useState(period)

  useEffect(() => {
    const update = () => {
      const now = Math.floor(Date.now() / 1000)
      setTimeRemaining(period - (now % period))
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [period])

  const progress = timeRemaining / period

  const barColor =
    timeRemaining > 15 ? "#22c55e" : timeRemaining > 7 ? "#eab308" : "#ef4444"

  return (
    <div className="h-0.5 w-full rounded-full bg-border">
      <div
        className="h-full rounded-full transition-all duration-1000 ease-linear"
        style={{
          width: `${progress * 100}%`,
          backgroundColor: barColor,
        }}
      />
    </div>
  )
}
