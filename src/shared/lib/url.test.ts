import { describe, expect, it } from "vitest";
import { createDraft, createProject } from "../../test/factories";
import { buildTrackingUrl } from "./url";

describe("buildTrackingUrl", () => {
  it("records a diff when an existing tracking parameter is removed by an empty field", () => {
    const project = createProject();
    const draft = createDraft({
      targetUrl: "https://shop.example.com/catalog?utm_term=old",
      utmTerm: "",
    });

    const result = buildTrackingUrl(project, draft);

    expect(result.finalUrl).not.toContain("utm_term=");
    expect(result.diffs).toContainEqual({ param: "utm_term", from: "old", to: "" });
  });

  it("records every removed value when a tracking parameter appears more than once", () => {
    const project = createProject();
    const draft = createDraft({
      targetUrl: "https://shop.example.com/catalog?utm_term=old1&utm_term=old2",
      utmTerm: "",
    });

    const result = buildTrackingUrl(project, draft);

    expect(result.finalUrl).not.toContain("utm_term=");
    expect(result.diffs).toContainEqual({ param: "utm_term", from: "old1, old2", to: "" });
  });

  it("removes stale rs even when roistat is already present", () => {
    const project = createProject();
    const draft = createDraft({
      targetUrl: "https://shop.example.com/catalog?roistat=direct1_cpc_brand_search&rs=stale_marker",
    });

    const result = buildTrackingUrl(project, draft);

    expect(result.finalUrl).toContain("roistat=direct1_cpc_brand:u:search");
    expect(result.finalUrl).not.toContain("rs=stale_marker");
    expect(result.diffs).toContainEqual({ param: "rs", from: "stale_marker", to: "" });
  });
});
