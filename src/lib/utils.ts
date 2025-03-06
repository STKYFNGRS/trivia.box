import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines multiple class values into a single className string.
 * Uses clsx to combine and twMerge to handle Tailwind CSS specificity conflicts.
 * 
 * @param inputs - Class values to be combined
 * @returns A merged className string
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
