"use client"

import { useEffect, useRef, useState } from "react"
import { BrowserMultiFormatReader } from "@zxing/browser"

type QrScannerProps = {
  onScan: (data: string) => void
  onError?: (error: Error) => void
}

export default function QrScanner({ onScan, onError }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const codeReader = new BrowserMultiFormatReader()
    let cancelled = false

    const stopCamera = () => {
      if (videoRef.current?.srcObject instanceof MediaStream) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop())
        videoRef.current.srcObject = null
      }
    }

    const startScanning = async () => {
      try {
        const controls = await codeReader.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          (result, err) => {
            if (cancelled) return
            if (result) {
              onScan(result.getText())
            }
          }
        )
        if (cancelled) {
          controls.stop()
          stopCamera()
          return
        }
        return controls
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to start camera")
        setError(error.message)
        onError?.(error)
      }
    }

    const controlsPromise = startScanning()

    return () => {
      cancelled = true
      controlsPromise.then((controls) => {
        controls?.stop()
        stopCamera()
      })
    }
  }, [onScan, onError])

  if (error) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-lg bg-muted">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    )
  }

  return (
    <div className="relative aspect-square overflow-hidden rounded-lg bg-black">
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        autoPlay
        playsInline
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-48 w-48 rounded-lg border-2 border-white/50" />
      </div>
    </div>
  )
}
