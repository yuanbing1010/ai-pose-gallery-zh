import { isValidElement, type ReactNode } from 'react'
import { toast as sonner, type ExternalToast, type ToastT, type ToastToDismiss } from 'sonner'

export const DEFAULT_TOAST_DURATION_MS = 1600
export const ALERT_TOAST_DURATION_MS = 3000
export const MAX_VISIBLE_TOASTS = 2

export type Notification = ToastT & {
  notificationDuration?: number
  notificationRevision?: number
  notificationAutoClosing?: { current: boolean }
  notificationOnDismiss?: ToastT['onDismiss']
  notificationDismissHandler?: ToastT['onDismiss']
}
let revision = 0

function isAlertKind(kind: ToastT['type'] | undefined) {
  return kind === 'error' || kind === 'warning'
}

function isLiveToast(item: ToastT | ToastToDismiss): item is Notification {
  return !('dismiss' in item) && !item.delete && item.id !== undefined
}

function isRoutineToast(item: Notification) {
  return item.type !== 'loading' && item.type !== 'error' && item.type !== 'warning'
}

function resolveReuseTarget(kind: ToastT['type'] | undefined): ToastT['id'] | undefined {
  if (kind === 'loading') return undefined
  const active = sonner.getToasts().filter(isLiveToast)
  if (isAlertKind(kind)) {
    // 警告或错误出现时清理旧的常规确认提示，避免被挡在栈底
    for (const item of active) {
      if (isRoutineToast(item)) sonner.dismiss(item.id)
    }
    return active.find((item) => isAlertKind(item.type))?.id
  }
  const reusable = active.find((item) => isRoutineToast(item))
  if (reusable) return reusable.id

  // 即使当前存在错误/警告提示，也限制非 loading 队列总数避免堆积
  const nonLoading = active.filter((item) => item.type !== 'loading')
  if (nonLoading.length >= MAX_VISIBLE_TOASTS) {
    const stale = [...nonLoading].reverse().find((item) => isRoutineToast(item))
    if (stale) sonner.dismiss(stale.id)
  }
  return undefined
}

// Sonner hides overflow toasts but still starts their clocks. Keep its renderer/store;
// the Toaster starts these clocks only after a notification can actually be read.
function managed(options: ExternalToast = {}, kind?: ToastT['type'], allowReuse = true) {
  const hasExplicitId = options.id !== undefined
  const reusedId = !hasExplicitId && allowReuse ? resolveReuseTarget(kind) : undefined
  const targetId = hasExplicitId ? options.id : reusedId
  const previous = hasExplicitId
    ? sonner.getToasts().find((item) => item.id === options.id) as Notification | undefined
    : undefined
  const nextRevision = ++revision
  const autoClosing = { current: false }
  const defaultDuration = isAlertKind(kind) ? ALERT_TOAST_DURATION_MS : DEFAULT_TOAST_DURATION_MS
  const onDismiss = hasExplicitId && !('onDismiss' in options)
    ? previous?.notificationOnDismiss
    : options.onDismiss
  const dismissHandler = (notice: ToastT) => { if (!autoClosing.current) onDismiss?.(notice) }
  return {
    ...options,
    ...(targetId !== undefined ? { id: targetId } : {}),
    ...(reusedId !== undefined
      ? {
          description: options.description,
          action: options.action,
          cancel: options.cancel,
          onAutoClose: options.onAutoClose,
        }
      : {}),
    duration: Infinity,
    notificationDuration: options.duration ?? previous?.notificationDuration ?? defaultDuration,
    notificationRevision: nextRevision,
    notificationAutoClosing: autoClosing,
    notificationOnDismiss: onDismiss,
    notificationDismissHandler: dismissHandler,
    onDismiss: dismissHandler,
    className: `${(options.className ?? '').split(/\s+/).filter((name) => !/^app-notification-\d+$/.test(name)).join(' ')} app-notification-${nextRevision}`,
  }
}

// Other independently built features can keep importing Sonner directly.
export function adoptNotification(notice: Notification): boolean {
  if (notice.delete) return false
  const current = sonner.getToasts().find((item) => item.id === notice.id) as Notification | undefined
  if (!current || current.delete) return false
  if (current.notificationRevision !== undefined && current.duration === Infinity && current.onDismiss === current.notificationDismissHandler) return false
  const onDismiss = current.onDismiss === current.notificationDismissHandler ? current.notificationOnDismiss : current.onDismiss
  const duration = current.notificationRevision !== undefined && current.duration === Infinity ? current.notificationDuration : current.duration
  const options = managed({ ...current, duration, onDismiss }, current.type, false)
  // Sonner's plain message method clears type; its typed methods preserve it.
  const publish = current.type === 'success' || current.type === 'info' || current.type === 'warning' || current.type === 'error' || current.type === 'loading'
    ? sonner[current.type] : sonner
  publish(current.title, options)
  return true
}

type PromiseOptions<T> = NonNullable<Parameters<typeof sonner.promise<T>>[1]>
function promiseResult(value: unknown, fallback: Omit<ExternalToast, 'description'>, kind: ToastT['type']) {
  const extended = value && typeof value === 'object' && !isValidElement(value) && 'message' in value
    ? value as ExternalToast & { message: ReactNode }
    : { message: value as ReactNode }
  return { ...managed({ ...fallback, ...extended }, kind, false), message: extended.message }
}

export const toast: typeof sonner = Object.assign(
  (message: Parameters<typeof sonner>[0], options?: ExternalToast) => sonner(message, managed(options, 'normal')),
  {
    ...sonner,
    success: (message: Parameters<typeof sonner.success>[0], options?: ExternalToast) => sonner.success(message, managed(options, 'success')),
    info: (message: Parameters<typeof sonner.info>[0], options?: ExternalToast) => sonner.info(message, managed(options, 'info')),
    warning: (message: Parameters<typeof sonner.warning>[0], options?: ExternalToast) => sonner.warning(message, managed(options, 'warning')),
    error: (message: Parameters<typeof sonner.error>[0], options?: ExternalToast) => sonner.error(message, managed(options, 'error')),
    loading: (message: Parameters<typeof sonner.loading>[0], options?: ExternalToast) => sonner.loading(message, managed(options, 'loading', false)),
    message: (message: Parameters<typeof sonner.message>[0], options?: ExternalToast) => sonner.message(message, managed(options, 'default')),
    custom: (render: Parameters<typeof sonner.custom>[0], options?: ExternalToast) => sonner.custom(render, managed(options, 'default')),
    promise: <T>(promise: Parameters<typeof sonner.promise<T>>[0], data?: PromiseOptions<T>) => {
      if (!data) return sonner.promise(promise, data)
      const { description, ...options } = data
      return sonner.promise(promise, {
        ...data,
        ...managed(options, 'loading', false),
        description,
        success: data.success === undefined ? undefined : async (value: T) => promiseResult(await (typeof data.success === 'function' ? data.success(value) : data.success), options, 'success'),
        error: data.error === undefined ? undefined : async (error: unknown) => promiseResult(await (typeof data.error === 'function' ? data.error(error) : data.error), options, 'error'),
      })
    },
  },
)
