/**
 * scripts/build.js の variants["variant-N"] と同じキー構成のJSON Schema。
 * (HERO_IMAGE_SRC/ALTは画像生成(2-4)側の担当のため対象外)
 */

function planProperties(n: number) {
  return {
    [`PLAN_${n}_NAME`]: { type: "string" },
    [`PLAN_${n}_PRICE`]: { type: "string" },
    [`PLAN_${n}_DESC`]: { type: "string" },
    [`PLAN_${n}_FEATURES`]: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
    [`PLAN_${n}_CTA_TEXT`]: { type: "string" },
  };
}

function testimonialProperties(n: number) {
  return {
    [`TESTIMONIAL_${n}_TEXT`]: { type: "string" },
    [`TESTIMONIAL_${n}_NAME`]: { type: "string" },
    [`TESTIMONIAL_${n}_ROLE`]: { type: "string" },
  };
}

function logoProperties(n: number) {
  return { [`LOGO_${n}_NAME`]: { type: "string" } };
}

export const COPY_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "<title>タグ・SEO用タイトル" },
    description: { type: "string", description: "meta description用の説明文" },
    hero: {
      type: "object",
      properties: {
        HERO_HEADLINE: { type: "string" },
        HERO_SUBCOPY: { type: "string" },
        HERO_CTA_TEXT: { type: "string" },
      },
      required: ["HERO_HEADLINE", "HERO_SUBCOPY", "HERO_CTA_TEXT"],
    },
    socialProof: {
      type: "object",
      properties: {
        SOCIAL_PROOF_STAT_NUMBER: { type: "string" },
        SOCIAL_PROOF_STAT_LABEL: { type: "string" },
        ...logoProperties(1),
        ...logoProperties(2),
        ...logoProperties(3),
        ...logoProperties(4),
        ...testimonialProperties(1),
        ...testimonialProperties(2),
        ...testimonialProperties(3),
      },
      required: [
        "SOCIAL_PROOF_STAT_NUMBER",
        "SOCIAL_PROOF_STAT_LABEL",
        "LOGO_1_NAME",
        "LOGO_2_NAME",
        "LOGO_3_NAME",
        "LOGO_4_NAME",
        "TESTIMONIAL_1_TEXT",
        "TESTIMONIAL_1_NAME",
        "TESTIMONIAL_1_ROLE",
        "TESTIMONIAL_2_TEXT",
        "TESTIMONIAL_2_NAME",
        "TESTIMONIAL_2_ROLE",
        "TESTIMONIAL_3_TEXT",
        "TESTIMONIAL_3_NAME",
        "TESTIMONIAL_3_ROLE",
      ],
    },
    pricing: {
      type: "object",
      properties: {
        ...planProperties(1),
        ...planProperties(2),
        ...planProperties(3),
      },
      required: [
        "PLAN_1_NAME",
        "PLAN_1_PRICE",
        "PLAN_1_DESC",
        "PLAN_1_FEATURES",
        "PLAN_1_CTA_TEXT",
        "PLAN_2_NAME",
        "PLAN_2_PRICE",
        "PLAN_2_DESC",
        "PLAN_2_FEATURES",
        "PLAN_2_CTA_TEXT",
        "PLAN_3_NAME",
        "PLAN_3_PRICE",
        "PLAN_3_DESC",
        "PLAN_3_FEATURES",
        "PLAN_3_CTA_TEXT",
      ],
    },
    cta: {
      type: "object",
      properties: {
        CTA_HEADLINE: { type: "string" },
        CTA_SUBCOPY: { type: "string" },
        CTA_BUTTON_TEXT: { type: "string" },
      },
      required: ["CTA_HEADLINE", "CTA_SUBCOPY", "CTA_BUTTON_TEXT"],
    },
  },
  required: ["title", "description", "hero", "socialProof", "pricing", "cta"],
} as const;
