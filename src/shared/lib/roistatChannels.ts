import type { TrafficSource } from "../../entities/project/model";

type ChannelPreset = {
  id: string;
  name: string;
  utmSource: string;
  markerPrefix: string;
};

export const roistatChannelPresets: ChannelPreset[] = [
  {
    id: "source_yandex_direct",
    name: "Яндекс Директ",
    utmSource: "yandex_direct",
    markerPrefix: "direct",
  },
  {
    id: "source_google_ads",
    name: "Google Ads",
    utmSource: "google_ads",
    markerPrefix: "google",
  },
  {
    id: "source_vk_ads",
    name: "VK Реклама",
    utmSource: "vk_ads",
    markerPrefix: "vkads",
  },
  {
    id: "source_tg_booster",
    name: "TG Booster",
    utmSource: "tg_booster",
    markerPrefix: "tgbooster",
  },
  {
    id: "source_avito",
    name: "Avito",
    utmSource: "avito",
    markerPrefix: "avito",
  },
  {
    id: "source_google_merchant",
    name: "Google Merchant Center",
    utmSource: "google_merchant",
    markerPrefix: "merchant",
  },
  {
    id: "source_vkontakte",
    name: "ВКонтакте",
    utmSource: "vkontakte",
    markerPrefix: "vk",
  },
  {
    id: "source_facebook",
    name: "Facebook",
    utmSource: "facebook",
    markerPrefix: "facebook",
  },
  {
    id: "source_mytarget",
    name: "myTarget",
    utmSource: "mytarget",
    markerPrefix: "mytarget",
  },
  {
    id: "source_yandex_market",
    name: "Яндекс Маркет",
    utmSource: "yandex_market",
    markerPrefix: "yamarket",
  },
];

export function createDefaultSources(): TrafficSource[] {
  return roistatChannelPresets.map((preset, index) => {
    const channelId = index + 1;

    return {
      id: preset.id,
      name: preset.name,
      utmSource: preset.utmSource,
      roistatMarker: `${preset.markerPrefix}${channelId}`,
      channelId,
      enabled: true,
    };
  });
}
