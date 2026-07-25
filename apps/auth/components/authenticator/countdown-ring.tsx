"use client"

import { useEffect, useState } from "react"

type CountdownRingProps = {
  period: number
  size?: number
  strokeWidth?: number
}

export default function CountdownRing({ period, size = 36, strokeWidth = 3 }: CountdownRingProps) {
  const [timeRemaining, setTimeRemaining] = useState(period)

  useEffect(() => {
    const update = () => {
      const now = Math.floor(Date.now() / 1000)
      const remaining = period - (now % period)
      setTimeRemaining(remaining)
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [period])

  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = timeRemaining / period
  const strokeDashoffset = circumference * (1 - progress)

  const getColor = () => {
    if (timeRemaining > 10) return "text-green-500"
    if (timeRemaining > 5) return "text-yellow-500"
    return "text-red-500"
  }

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className={`-rotate-90 transform ${getColor()}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="opacity-20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-linear"
        />
      </svg>
      <span className="absolute text-xs font-medium">{timeRemaining}</span>
    </div>
  )
}
