import { currentUser } from "@clerk/nextjs/server";

export async function isClerkAdmin(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  const role = user.publicMetadata?.role;
  if (role === "admin") return true;
  const allow = process.env.ADMIN_CLERK_USER_IDS?.split(",").map((s) => s.trim()).filter(Boolean);
  if (allow?.includes(user.id)) return true;
  return false;
}
