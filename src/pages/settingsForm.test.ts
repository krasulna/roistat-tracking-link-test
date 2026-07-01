import { describe, expect, it } from "vitest";
import { createProject, createSource } from "../test/factories";
import { getSettingsFormState, validateSettingsForm } from "./settingsForm";

describe("settings form validation", () => {
  it("rejects invalid numeric values instead of producing NaN", () => {
    const project = createProject();
    const form = getSettingsFormState(project);
    const result = validateSettingsForm(
      {
        ...form,
        budgetLimit: "not-a-number",
        sources: "Yandex;yandex_direct;direct1;bad-channel",
      },
      project.allowedSources,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("budget");
      expect(result.errors.join("\n")).toContain("channel_id");
    }
  });

  it("rejects incomplete source rows instead of silently generating replacement values", () => {
    const project = createProject();
    const form = getSettingsFormState(project);
    const result = validateSettingsForm(
      {
        ...form,
        sources: "Only name;;;",
      },
      project.allowedSources,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("utm_source");
      expect(result.errors.join("\n")).toContain("roistat_marker");
      expect(result.errors.join("\n")).toContain("channel_id");
    }
  });

  it("returns a valid project patch with finite numeric fields", () => {
    const fallbackSource = createSource({
      id: "source_fallback",
      utmSource: "yandex_direct",
      channelId: 9,
    });
    const result = validateSettingsForm(
      {
        name: " Updated project ",
        trustedDomain: " shop.example.com ",
        allowedDomains: "promo.example.com, land.example.com",
        budgetLimit: "2500",
        sources: "Yandex;yandex_direct;direct7;7",
      },
      [fallbackSource],
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.name).toBe("Updated project");
      expect(result.patch.trustedDomain).toBe("shop.example.com");
      expect(result.patch.allowedDomains).toEqual(["promo.example.com", "land.example.com"]);
      expect(result.patch.budgetLimit).toBe(2500);
      expect(result.patch.allowedSources[0]).toMatchObject({
        id: "source_fallback",
        channelId: 7,
      });
    }
  });

  it("rejects trustedDomain and allowedDomains that are URLs instead of hostnames", () => {
    const project = createProject();
    const form = getSettingsFormState(project);
    const result = validateSettingsForm(
      {
        ...form,
        trustedDomain: "https://shop.example.com",
        allowedDomains: "promo.example.com\nhttps://bad.example.com/path",
      },
      project.allowedSources,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("Trusted domain must be a hostname");
      expect(result.errors.join("\n")).toContain("Allowed domain");
    }
  });

  it("allows roistat markers that match the settings mask and channel_id", () => {
    const project = createProject();
    const form = getSettingsFormState(project);
    const result = validateSettingsForm(
      {
        ...form,
        sources: "Yandex;yandex_direct;google_ads3;3",
      },
      project.allowedSources,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.allowedSources[0].roistatMarker).toBe("google_ads3");
    }
  });

  it("rejects roistat markers that do not match the settings mask", () => {
    const project = createProject();
    const form = getSettingsFormState(project);
    const result = validateSettingsForm(
      {
        ...form,
        sources: "Yandex;yandex_direct;abc123!1;1",
      },
      project.allowedSources,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("roistat_marker must match");
    }
  });

  it("rejects roistat markers whose numeric suffix does not match channel_id", () => {
    const project = createProject();
    const form = getSettingsFormState(project);
    const result = validateSettingsForm(
      {
        ...form,
        sources: "Yandex;yandex_direct;direct2;1",
      },
      project.allowedSources,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("numeric suffix");
    }
  });

  it("keeps source ids with their utm_source when rows are reordered", () => {
    const yandex = createSource({
      id: "source_yandex_direct",
      name: "Yandex",
      utmSource: "yandex_direct",
      roistatMarker: "direct1",
      channelId: 1,
    });
    const google = createSource({
      id: "source_google_ads",
      name: "Google",
      utmSource: "google_ads",
      roistatMarker: "google2",
      channelId: 2,
    });
    const result = validateSettingsForm(
      {
        name: "Project",
        trustedDomain: "shop.example.com",
        allowedDomains: "",
        budgetLimit: "1000",
        sources: "Google;google_ads;google2;2\nYandex;yandex_direct;direct1;1",
      },
      [yandex, google],
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.allowedSources.map((source) => [source.utmSource, source.id])).toEqual([
        ["google_ads", "source_google_ads"],
        ["yandex_direct", "source_yandex_direct"],
      ]);
    }
  });

  it("roundtrips source names and utm_source values that contain semicolons", () => {
    const source = createSource({
      id: "source_delimited",
      name: "Foo; Bar",
      utmSource: "foo;bar",
      roistatMarker: "foo_bar2",
      channelId: 2,
    });
    const project = createProject({
      allowedSources: [source],
    });
    const form = getSettingsFormState(project);
    const result = validateSettingsForm(form, project.allowedSources);

    expect(form.sources).toBe('"Foo; Bar";"foo;bar";foo_bar2;2');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.allowedSources[0]).toMatchObject({
        id: "source_delimited",
        name: "Foo; Bar",
        utmSource: "foo;bar",
        roistatMarker: "foo_bar2",
        channelId: 2,
      });
    }
  });

  it("rejects duplicate utm_source rows", () => {
    const project = createProject();
    const form = getSettingsFormState(project);
    const result = validateSettingsForm(
      {
        ...form,
        sources: "Yandex;yandex_direct;direct1;1\nYandex Copy;yandex_direct;direct2;2",
      },
      project.allowedSources,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("utm_source must be unique");
    }
  });

  it("rejects duplicate roistat_marker rows", () => {
    const project = createProject();
    const form = getSettingsFormState(project);
    const result = validateSettingsForm(
      {
        ...form,
        sources: "Yandex;yandex_direct;direct1;1\nGoogle;google_ads;direct1;2",
      },
      project.allowedSources,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("roistat_marker must be unique");
    }
  });

  it("rejects duplicate channel_id rows", () => {
    const project = createProject();
    const form = getSettingsFormState(project);
    const result = validateSettingsForm(
      {
        ...form,
        sources: "Yandex;yandex_direct;direct1;1\nGoogle;google_ads;google1;1",
      },
      project.allowedSources,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("channel_id must be unique");
    }
  });

  it("rejects an empty sources list instead of silently restoring previous sources", () => {
    const project = createProject();
    const form = getSettingsFormState(project);
    const result = validateSettingsForm(
      {
        ...form,
        sources: " \n ",
      },
      project.allowedSources,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("Sources list cannot be empty");
    }
  });
});
