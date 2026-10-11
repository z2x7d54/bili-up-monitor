import { describe, expect, it } from "vitest";
import { getMixinKey, signWbiParams } from "@/lib/bilibili/wbi";

describe("wbi signing", () => {
  it("generates the expected mixin key length", () => {
    const key = getMixinKey(
      "7cd084941338484aae1ad9425b84077c",
      "4932caff0ff746eab6f01bf08b70ac45",
    );
    expect(key).toHaveLength(32);
    expect(key).toBe("ea1db124af3c7062474693fa704f4ff8");
  });

  it("sorts params, sanitizes special chars, and signs deterministically", () => {
    const signed = signWbiParams(
      { b: "hello world", a: "x!(y)", mid: 123 },
      "7cd084941338484aae1ad9425b84077c",
      "4932caff0ff746eab6f01bf08b70ac45",
      1700000000,
    );

    expect(signed.a).toBe("xy");
    expect(signed.wts).toBe("1700000000");
    expect(signed.w_rid).toBe("46205afc70a9bc3ed3e94c830c377db6");
  });
});
