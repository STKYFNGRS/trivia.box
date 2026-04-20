import { redirect } from "next/navigation";

// Legacy venue signup path: every signup is now a unified player-first flow.
// Hosts upgrade from the player dashboard after paying.
export default function Page() {
  redirect("/sign-up");
}
