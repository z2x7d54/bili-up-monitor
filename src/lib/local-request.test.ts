import { describe, expect, it } from "vitest";
import { localRequestError } from "@/lib/local-request";
describe("local service request protection", () => {
  const request = (headers: Record<string,string> = {}, method = "POST") => new Request("http://127.0.0.1:3000/api/settings", { method, headers: { host: "127.0.0.1:3000", ...headers } });
  it("allows own browser requests and local command-line access", () => {
    expect(localRequestError(request({ origin: "http://127.0.0.1:3000", "sec-fetch-site": "same-origin", "content-type": "application/json; charset=utf-8" }))).toBeNull();
    expect(localRequestError(request())).toBeNull();
    expect(localRequestError(new Request("http://localhost:3000/api/groups", { headers: { host: "localhost:3000" } }))).toBeNull();
    expect(localRequestError(new Request("http://[::1]:3000/api/groups", { headers: { host: "[::1]:3000" } }))).toBeNull();
  });
  it("blocks foreign, null and different-port origins, even forged forwarding headers", () => {
    for (const origin of ["https://evil.example", "null", "http://127.0.0.1:4000", "http://127.0.0.1:3000/path"]) expect(localRequestError(request({origin}))).not.toBeNull();
    expect(localRequestError(request({host:"evil.example:3000", "x-forwarded-host":"127.0.0.1:3000"}))).not.toBeNull();
    expect(localRequestError(request({host:"127.0.0.1:3000@evil.example"}))).not.toBeNull();
  });
  it("blocks cross-site reads, same-site other apps and form-based writes", () => {
    expect(localRequestError(request({"sec-fetch-site":"cross-site"},"GET"))).not.toBeNull();
    expect(localRequestError(request({"sec-fetch-site":"same-site"}))).not.toBeNull();
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]) expect(localRequestError(request({"content-type":type}))).not.toBeNull();
  });
});
