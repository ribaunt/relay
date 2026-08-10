"use client"

import { useEffect, useRef, useState } from "react"
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser"

type QrScannerProps = {
  onScan: (data: string) => void
  onError?: (error: Error) => void
}

type ScannerStatus = "requesting" | "active" | "error" | "unsupported"

export default function QrScanner({ onScan, onError }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<ScannerStatus>("requesting")
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (typeof navigator === "undefined") return

    let cancelled = false
    let stream: MediaStream | null = null
    let controls: IScannerControls | null = null
    const codeReader = new BrowserMultiFormatReader()

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported")
        return
      }

      const video = videoRef.current
      if (!video) return

      try {
        // Request the rear camera explicitly. Letting the prompt come from our own
        // getUserMedia call (rather than the library picking constraints) is what
        // makes the OS permission dialog surface in installed PWAs.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        })

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        video.srcObject = stream
        await video.play().catch(() => {})

        controls = await codeReader.decodeFromStream(stream, video, (result) => {
          if (cancelled) return
          if (result) onScan(result.getText())
        })

        setStatus("active")
      } catch (err) {
        if (cancelled) return
        stream?.getTracks().forEach((t) => t.stop())
        const e = err instanceof Error ? err : new Error("Failed to start camera")
        if (e.name === "NotAllowedError") {
          setError("Camera access is blocked. Enable the camera for Relay Auth in your browser settings, then try again.")
        } else if (e.name === "NotFoundError" || e.name === "OverconstrainedError") {
          setError("No camera found on this device.")
        } else {
          setError("Failed to start the camera. Please try again.")
        }
        setStatus("error")
        onError?.(e)
      }
    }

    // Defer until the drawer has settled. On iOS, calling getUserMedia while the
    // host view is still animating can suppress the camera permission prompt.
    const timer = setTimeout(() => {
      void start()
    }, 150)

    return () => {
      cancelled = true
      clearTimeout(timer)
      controls?.stop()
      stream?.getTracks().forEach((t) => t.stop())
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
    }
  }, [attempt, onScan, onError])

  if (status === "error") {
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-3 rounded-lg bg-muted px-6 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setStatus("requesting")
            setAttempt((a) => a + 1)
          }}
          className="touch-target rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground active:scale-95"
        >
          Try again
        </button>
      </div>
    )
  }

  if (status === "unsupported") {
    return (
      <div className="flex aspect-square items-center justify-center rounded-lg bg-muted px-6 text-center">
        <p className="text-sm text-muted-foreground">
          Camera scanning is not supported on this device. Use manual entry instead.
        </p>
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
      {status === "requesting" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-white/80">Requesting camera…</p>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-48 w-48 rounded-lg border-2 border-white/50" />
      </div>
    </div>
  )
}
