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
  const [attempt, setAttempt] = useState(0)

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
  }, [onScan, onError, attempt])

  if (error) {
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-3 rounded-lg bg-muted px-6 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setAttempt((a) => a + 1)
          }}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground active:scale-95"
        >
          Try again
        </button>
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
        muted
        disablePictureInPicture
        aria-label="QR code camera preview"
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-48 w-48 rounded-lg border-2 border-white/50" />
      </div>
    </div>
  )
}
