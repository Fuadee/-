import { getEProcurementCardData } from "./eProcurementFields.ts";

export type JobLike = Record<string, unknown>;

export type EProcurementDialogState = {
  id: string;
  title: string;
  status: string;
  returnFromStatus: string;
  detailsText: string;
  vendorName: string;
  taxId: string;
  grandTotal: number | null;
};

const asTrimmedString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export const parseJobPayloadForDialog = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
};

export const listDeepKeys = (value: unknown, maxDepth = 3, prefix = ""): string[] => {
  if (maxDepth < 0 || !value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const objectValue = value as Record<string, unknown>;
  const results: string[] = [];
  for (const [key, child] of Object.entries(objectValue)) {
    const path = prefix ? `${prefix}.${key}` : key;
    results.push(path);
    if (child && typeof child === "object" && !Array.isArray(child)) {
      results.push(...listDeepKeys(child, maxDepth - 1, path));
    }
  }

  return results;
};

export const getInspectableJobShape = (job: JobLike) => {
  const parsedPayload = parseJobPayloadForDialog(job.payload);

  return {
    keys: Object.keys(job),
    payload_type: Array.isArray(job.payload) ? "array" : job.payload === null ? "null" : typeof job.payload,
    payload_keys: Object.keys(parsedPayload),
    payload_deep_keys: listDeepKeys(parsedPayload, 3)
  };
};

export const buildEProcurementDialogState = (params: {
  id: string;
  title: string;
  status: string;
  job: JobLike;
}): EProcurementDialogState => {
  const payload = parseJobPayloadForDialog(params.job.payload);
  const eProcurement = getEProcurementCardData(payload);

  return {
    id: params.id,
    title: params.title,
    status: params.status,
    returnFromStatus: asTrimmedString(params.job.return_from_status),
    detailsText: eProcurement.summary.value,
    vendorName: eProcurement.vendorName.value,
    taxId: eProcurement.taxId.value || asTrimmedString(params.job.tax_id),
    grandTotal: eProcurement.totalInclVat.value
  };
};
