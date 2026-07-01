import { describe, expect, it } from "vitest";
import { createProject, createSource } from "../../test/factories";
import { projectSchema } from "./model";

describe("project schema", () => {
  it("rejects duplicate roistat markers and channel ids", () => {
    const project = createProject({
      allowedSources: [
        createSource({
          id: "source_direct",
          utmSource: "yandex_direct",
          roistatMarker: "direct1",
          channelId: 1,
        }),
        createSource({
          id: "source_google",
          utmSource: "google_ads",
          roistatMarker: "direct1",
          channelId: 1,
        }),
      ],
    });

    const result = projectSchema.safeParse(project);

    expect(result.success).toBe(false);
    if (!result.success) {
      const issueText = result.error.issues.map((issue) => issue.message).join("\n");
      expect(issueText).toContain("roistatMarker values must be unique");
      expect(issueText).toContain("channelId values must be unique");
    }
  });
});
