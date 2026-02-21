import { describe, test, expect } from "bun:test";
import { parsePagesConfig, getMimeType, type PagesConfig } from "../src/services/pages-service";

describe("parsePagesConfig", () => {
  test("parses full .pages TOML config", () => {
    const toml = `[pages]\ndirectory = "dist"\nentry = "app.html"`;
    const config = parsePagesConfig(toml);
    expect(config).toEqual({ directory: "dist", entry: "app.html" });
  });

  test("uses defaults for empty [pages] section", () => {
    const config = parsePagesConfig("[pages]\n");
    expect(config).toEqual({ directory: ".", entry: "index.html" });
  });

  test("uses defaults for minimal config", () => {
    const config = parsePagesConfig("[pages]");
    expect(config).toEqual({ directory: ".", entry: "index.html" });
  });

  test("returns null for missing [pages] section", () => {
    const config = parsePagesConfig("# just a comment");
    expect(config).toBeNull();
  });

  test("returns null for empty string", () => {
    const config = parsePagesConfig("");
    expect(config).toBeNull();
  });

  test("handles directory-only config", () => {
    const config = parsePagesConfig(`[pages]\ndirectory = "public"`);
    expect(config).toEqual({ directory: "public", entry: "index.html" });
  });

  test("handles entry-only config", () => {
    const config = parsePagesConfig(`[pages]\nentry = "main.html"`);
    expect(config).toEqual({ directory: ".", entry: "main.html" });
  });

  test("rejects directory with path traversal", () => {
    const config = parsePagesConfig(`[pages]\ndirectory = "../evil"`);
    expect(config).toBeNull();
  });
});

describe("getMimeType", () => {
  test("returns correct type for html", () => {
    expect(getMimeType("index.html")).toBe("text/html; charset=utf-8");
  });

  test("returns correct type for css", () => {
    expect(getMimeType("styles.css")).toBe("text/css; charset=utf-8");
  });

  test("returns correct type for js", () => {
    expect(getMimeType("app.js")).toBe("application/javascript; charset=utf-8");
  });

  test("returns correct type for wasm", () => {
    expect(getMimeType("game.wasm")).toBe("application/wasm");
  });

  test("returns octet-stream for unknown extensions", () => {
    expect(getMimeType("data.xyz")).toBe("application/octet-stream");
  });

  test("handles nested paths", () => {
    expect(getMimeType("assets/images/logo.png")).toBe("image/png");
  });
});
