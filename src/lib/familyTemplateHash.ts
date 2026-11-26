/**
 * SHA-256 (base64) of the executable script inside public/family-template.html.
 * The exporter refuses to build a family file from a template whose script differs, so a
 * swapped or stale template can never ship a different decryptor (review M2-10).
 * Kept in sync by src/test/family-template.test.ts.
 *
 * FAMILY_TEMPLATE_SHA256 pins the WHOLE template file (markup, meta CSP, styles, script), so no
 * part of a family file's security boundary can differ from the reviewed release (review C3).
 */
export const FAMILY_TEMPLATE_SHA256 = "i5A2XIJPuKgSPobALzMhWpuOy3WnZBPImhs6CmMe2/g=";
/** @deprecated kept for the CSP hash test */
export const FAMILY_TEMPLATE_SCRIPT_SHA256 = "0Y4/Lbuze3o8o1Fli3AsGAHKlwL5GURwaEc0Zy9XfJk=";
