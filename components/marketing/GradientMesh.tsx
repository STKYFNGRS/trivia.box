import { cn } from "@/lib/utils";

/**
 * Three soft radial blobs that drift slowly behind a hero. Pure CSS animation
 * (keyframes in `globals.css`), so no runtime cost. The container is
 * `pointer-events: none` and absolutely positioned — drop it inside any
 * relatively-positioned parent.
 */
export function GradientMesh({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className
      )}
    >
      <div
        className="absolute -left-[10%] -top-[10%] size-[60vmax] rounded-full opacity-60 blur-3xl mesh-drift-a"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--neon-magenta) 80%, transparent), transparent 70%)",
          animation: "mesh-drift-a 22s ease-in-out infinite",
        }}
      />
      <div
        className="absolute -right-[15%] top-[10%] size-[55vmax] rounded-full opacity-50 blur-3xl mesh-drift-b"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--neon-cyan) 70%, transparent), transparent 70%)",
          animation: "mesh-drift-b 28s ease-in-out infinite",
        }}
      />
      <div
        className="absolute bottom-[-25%] left-[20%] size-[55vmax] rounded-full opacity-40 blur-3xl mesh-drift-c"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--neon-violet) 70%, transparent), transparent 70%)",
          animation: "mesh-drift-c 34s ease-in-out infinite",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, transparent 30%, color-mix(in oklab, var(--stage-bg) 80%, transparent) 100%)",
        }}
      />
    </div>
  );
}
