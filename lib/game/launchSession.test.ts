import { describe, expect, it } from "vitest";
import { LaunchBlockedError } from "./launchSession";

describe("LaunchBlockedError", () => {
  it("carries the reason and timestamp", () => {
    const when = new Date("2030-01-01T00:00:00Z");
    const err = new LaunchBlockedError("too_late", when);
    expect(err.reason).toBe("too_late");
    expect(err.eventStartsAt?.toISOString()).toBe("2030-01-01T00:00:00.000Z");
    expect(err.name).toBe("LaunchBlockedError");
    expect(err).toBeInstanceOf(Error);
  });

  it("defaults eventStartsAt to null", () => {
    const err = new LaunchBlockedError("venue_busy");
    expect(err.eventStartsAt).toBeNull();
  });

  it("has an inspectable message encoding the reason", () => {
    const err = new LaunchBlockedError("already_launched");
    expect(err.message).toContain("already_launched");
  });
});
