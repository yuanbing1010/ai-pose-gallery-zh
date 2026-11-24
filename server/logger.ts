export type LogLevel = 'info' | 'warn' | 'error'

function serializeError(err: unknown): Record<string, unknown> | undefined {
  if (!err) return undefined
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack?.slice(0, 1000),
    }
  }
  return { message: String(err) }
}

function emit(level: LogLevel, event: string, data?: Record<string, unknown>, err?: unknown) {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(data || {}),
  }
  const serializedErr = serializeError(err)
  if (serializedErr) {
    entry.error = serializedErr
  }
  const line = JSON.stringify(entry)
  if (level === 'error') {
    console.error(line)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.log(line)
  }
}

export function logInfo(event: string, data?: Record<string, unknown>) {
  emit('info', event, data)
}

export function logWarn(event: string, data?: Record<string, unknown>, err?: unknown) {
  emit('warn', event, data, err)
}

export function logError(event: string, data?: Record<string, unknown>, err?: unknown) {
  emit('error', event, data, err)
}
