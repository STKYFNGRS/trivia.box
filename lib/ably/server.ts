import Ably from "ably";

function getRest(): Ably.Rest {
  const key = process.env.ABLY_API_KEY;
  if (!key) {
    throw new Error("ABLY_API_KEY is not set");
  }
  return new Ably.Rest(key);
}

export async function publishGameEvent(joinCode: string, name: string, data: unknown) {
  const channel = getRest().channels.get(`game:${joinCode}`);
  await channel.publish(name, data as never);
}
