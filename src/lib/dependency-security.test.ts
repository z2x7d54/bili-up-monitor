import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
const require = createRequire(import.meta.url);
const braces = require("braces");
describe("patched brace parser depth limit", () => {
  it("rejects deeply nested strings before recursive stack exhaustion", () => {
    const input = "{".repeat(3000) + "a,b" + "}".repeat(3000);
    for (const mode of ["parse", "compile", "expand", "stringify"]) expect(() => braces[mode](input)).toThrow(/nesting exceeds/);
  });
  it("also rejects deep caller-supplied ASTs", () => {
    let tree: {type:string;nodes:unknown[]} = {type:"root",nodes:[]};
    for(let i=0;i<5000;i++) tree={type:"root",nodes:[tree]};
    expect(()=>braces.compile(tree)).toThrow(SyntaxError);
    expect(()=>braces.stringify(tree)).toThrow(SyntaxError);
    expect(()=>braces.expand(tree)).toThrow(SyntaxError);
  });
  it("preserves normal filename patterns", () => {
    expect(braces.expand("src/{lib,app}/*.{ts,tsx}")).toEqual(["src/lib/*.ts","src/lib/*.tsx","src/app/*.ts","src/app/*.tsx"]);
    expect(braces.compile("{a,b}")).toBe("(a|b)");
  });
});
