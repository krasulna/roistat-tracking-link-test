import { describe, expect, it } from "vitest";
import { createCampaign, createDraft, createProject, createSource } from "../../test/factories";
import { analyzeTrackingLink } from "./model";

describe("analyzeTrackingLink", () => {
  it("reports removed existing tracking parameters in diffs and warnings", () => {
    const project = createProject();
    const result = analyzeTrackingLink(
      project,
      [],
      createDraft({
        targetUrl: "https://shop.example.com/catalog?utm_term=old",
        utmTerm: "",
      }),
    );

    expect(result.diffs).toContainEqual({ param: "utm_term", from: "old", to: "" });
    expect(result.warnings.map((warning) => warning.code)).toContain("already_marked_url");
    expect(result.warnings.map((warning) => warning.code)).toContain("tracking_params_removed");
  });

  it("warns when stale rs is removed from a URL that also has roistat", () => {
    const project = createProject();
    const result = analyzeTrackingLink(
      project,
      [],
      createDraft({
        targetUrl: "https://shop.example.com/catalog?roistat=direct1_cpc_brand_search&rs=stale_marker",
      }),
    );

    expect(result.finalUrl).not.toContain("rs=stale_marker");
    expect(result.diffs).toContainEqual({ param: "rs", from: "stale_marker", to: "" });
    expect(result.warnings.map((warning) => warning.code)).toContain("already_marked_url");
    expect(result.warnings.map((warning) => warning.code)).toContain("tracking_params_removed");
  });

  it.each(["javascript:alert(1)", "mailto:lead@example.com"])(
    "fails non-http target URL %s instead of allowing it with a confirmable domain warning",
    (targetUrl) => {
    const project = createProject();
    const result = analyzeTrackingLink(
      project,
      [],
      createDraft({
          targetUrl,
      }),
    );

    expect(result.status).toBe("failed");
    expect(result.finalUrl).toBe("");
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "invalid_url",
        requiresConfirmation: false,
      }),
    );
    },
  );

  it("fails a new campaign when its budget exceeds the remaining project budget", () => {
    const project = createProject({ budgetLimit: 100 });
    const campaigns = [createCampaign({ budget: 90 })];
    const result = analyzeTrackingLink(
      project,
      campaigns,
      createDraft({
        utmCampaign: "new_campaign",
        budget: 20,
      }),
    );

    expect(result.status).toBe("failed");
    expect(result.warnings.map((warning) => warning.code)).toContain("campaign_budget_exceeds_remaining");
  });

  it("does not fail an existing campaign when no new campaign spend will be created", () => {
    const project = createProject({ budgetLimit: 100 });
    const campaigns = [createCampaign({ utmCampaign: "brand_search", budget: 90 })];
    const result = analyzeTrackingLink(
      project,
      campaigns,
      createDraft({
        utmCampaign: "brand_search",
        budget: 20,
      }),
    );

    expect(result.status).not.toBe("failed");
    expect(result.warnings.map((warning) => warning.code)).not.toContain("campaign_budget_exceeds_remaining");
  });

  it("warns specifically when the requested source exists but is disabled", () => {
    const project = createProject({
      allowedSources: [
        createSource({
          utmSource: "old_source",
          roistatMarker: "oldsource1",
          enabled: false,
        }),
      ],
    });
    const result = analyzeTrackingLink(
      project,
      [],
      createDraft({
        utmSource: "old_source",
      }),
    );

    expect(result.status).toBe("warning");
    expect(result.warnings.map((warning) => warning.code)).toContain("source_disabled");
    expect(result.warnings.map((warning) => warning.code)).not.toContain("source_not_allowed");
  });
});
