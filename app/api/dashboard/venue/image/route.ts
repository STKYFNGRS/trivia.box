import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import {
  ALLOWED_VENUE_IMAGE_MIMES,
  MAX_VENUE_IMAGE_BYTES,
  clearVenueImage,
  setVenueImage,
  type VenueImageMime,
} from "@/lib/venue";

async function loadAccount() {
  const { userId } = await auth();
  if (!userId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const account = await getAccountByClerkUserId(userId);
  if (!account) {
    return { error: NextResponse.json({ error: "Account not found" }, { status: 400 }) };
  }
  if (account.accountType !== "host" && account.accountType !== "site_admin") {
    return { error: NextResponse.json({ error: "Not a host" }, { status: 403 }) };
  }
  return { account };
}

export async function POST(req: Request) {
  const gate = await loadAccount();
  if ("error" in gate) return gate.error;

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'image' file field" }, { status: 400 });
  }

  const mime = file.type as string;
  if (!ALLOWED_VENUE_IMAGE_MIMES.includes(mime as VenueImageMime)) {
    return NextResponse.json(
      { error: `Unsupported image type. Use ${ALLOWED_VENUE_IMAGE_MIMES.join(", ")}` },
      { status: 400 }
    );
  }

  if (file.size > MAX_VENUE_IMAGE_BYTES) {
    return NextResponse.json(
      { error: `Image too large. Max ${Math.floor(MAX_VENUE_IMAGE_BYTES / (1024 * 1024))} MB.` },
      { status: 413 }
    );
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.byteLength === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }

  const updated = await setVenueImage(gate.account.id, mime as VenueImageMime, buf);
  return NextResponse.json({
    venue: {
      accountId: updated.accountId,
      slug: updated.slug,
      imageUpdatedAt: updated.imageUpdatedAt,
      imageMime: updated.imageMime,
    },
  });
}

export async function DELETE() {
  const gate = await loadAccount();
  if ("error" in gate) return gate.error;
  const updated = await clearVenueImage(gate.account.id);
  return NextResponse.json({
    venue: {
      accountId: updated.accountId,
      slug: updated.slug,
      imageUpdatedAt: updated.imageUpdatedAt,
    },
  });
}
