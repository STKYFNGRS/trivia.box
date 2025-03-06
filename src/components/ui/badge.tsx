import * as React from "react";

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline";
}

export function Badge({ 
  className, 
  variant = "default", 
  ...props 
}: BadgeProps) {
  const variantClasses = {
    default: "bg-purple-500/20 text-purple-200",
    secondary: "bg-slate-800 text-slate-200",
    destructive: "bg-red-500/20 text-red-200",
    outline: "border border-slate-700 text-slate-200"
  };

  return (
    <div
      className={`
        inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors
        ${variantClasses[variant]}
        ${className}
      `}
      {...props}
    />
  );
}