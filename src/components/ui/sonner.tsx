import type { CSSProperties } from "react"
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useMediaQuery } from "@/hooks/useMediaQuery"

// Toasts sit at the bottom on phones and top-right on desktop, for 4 seconds (design brief §5).
const Toaster = ({ ...props }: ToasterProps) => {
  const isDesktop = useMediaQuery("(min-width: 1024px)")

  return (
    <Sonner
      theme="light"
      position={isDesktop ? "top-right" : "bottom-center"}
      duration={4000}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-5" />,
        info: <InfoIcon className="size-5" />,
        warning: <TriangleAlertIcon className="size-5" />,
        error: <OctagonXIcon className="size-5" />,
        loading: <Loader2Icon className="size-5 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-lg)",
        } as CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
