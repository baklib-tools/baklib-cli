import { toastManager } from "@/components/ui/toast"

export type AppNotifyVariant = "error" | "success" | "info" | "warning"

const titles: Record<AppNotifyVariant, string> = {
  error: "操作失败",
  success: "操作成功",
  info: "提示",
  warning: "注意",
}

/** 顶部 Toast：用于面板内错误、成功等操作反馈 */
export function appNotify(message: string, variant: AppNotifyVariant = "error") {
  toastManager.add({
    title: titles[variant],
    description: message,
    type: variant,
    timeout: variant === "error" ? 9000 : 4500,
    priority: variant === "error" ? "high" : "low",
  })
}
