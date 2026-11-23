/**
 * SHA-256 (base64) of the executable script inside public/family-template.html.
 * The exporter refuses to build a family file from a template whose script differs, so a
 * swapped or stale template can never ship a different decryptor (review M2-10).
 * Kept in sync by src/test/family-template.test.ts.
 *
 * FAMILY_TEMPLATE_SHA256 pins the WHOLE template file (markup, meta CSP, styles, script), so no
 * part of a family file's security boundary can differ from the reviewed release (review C3).
 */
export const FAMILY_TEMPLATE_SHA256 = "5XDTCByUuW4kco1KVBbo1UcZDW6MYYcr/fyINOCh/Dk=";
/** @deprecated kept for the CSP hash test */
export const FAMILY_TEMPLATE_SCRIPT_SHA256 = "fb+Wr/oyPL04ZfbkAq5T4ydf9+3qVsjhiTu6LOcAVEI=";
