import HandoffConsumer from "@/components/handoff-consumer"
import { authEnv } from "@/lib/auth/env"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function readSingleValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") {
    return value
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0]
  }

  return undefined
}

export default async function HandoffConsumePage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const resolvedSearchParams = await searchParams
  const returnTo = readSingleValue(resolvedSearchParams.returnTo) ?? authEnv.defaultReturnTo

  return <HandoffConsumer returnTo={returnTo} />
}

