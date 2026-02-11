import type { Case } from '../types';

const STORAGE_KEY = 'procurement_cases';

const makeId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `case-${Date.now()}-${Math.floor(Math.random() * 10000)}`);

const nowIso = () => new Date().toISOString();

const buildCaseNo = () => `CASE-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

const defaultCase = (): Case => {
  const timestamp = nowIso();
  return {
    id: makeId(),
    case_no: buildCaseNo(),
    title: '',
    request_date: new Date().toISOString().slice(0, 10),
    department: '',
    requester: '',
    vendor: '',
    vat_enabled: true,
    vat_rate: 7,
    items: [
      {
        id: makeId(),
        description: '',
        quantity: 1,
        unit: '',
        unit_price: 0
      }
    ],
    attachments: [],
    status: 'draft',
    created_at: timestamp,
    updated_at: timestamp
  };
};

const parseCases = (): Case[] => {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Case[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const dedupeCasesById = (cases: Case[]): Case[] => {
  const latestById = new Map<string, Case>();

  for (const item of cases) {
    const existing = latestById.get(item.id);

    if (!existing) {
      latestById.set(item.id, item);
      continue;
    }

    const existingUpdatedAt = new Date(existing.updated_at).getTime();
    const itemUpdatedAt = new Date(item.updated_at).getTime();

    if (itemUpdatedAt >= existingUpdatedAt) {
      latestById.set(item.id, item);
    }
  }

  return Array.from(latestById.values());
};

const writeCases = (cases: Case[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
};

export function listCases(): Case[] {
  return dedupeCasesById(parseCases()).sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

export function getCase(id: string): Case | null {
  const found = dedupeCasesById(parseCases()).find((item) => item.id === id);
  return found ?? null;
}

export function createCase(initial?: Partial<Case>): Case {
  const draft = {
    ...defaultCase(),
    ...initial
  } satisfies Case;

  const cases = dedupeCasesById(parseCases());
  cases.unshift(draft);
  writeCases(cases);
  return draft;
}

export function saveCase(c: Case): Case {
  const cases = dedupeCasesById(parseCases());
  const payload: Case = {
    ...c,
    updated_at: nowIso()
  };
  const index = cases.findIndex((item) => item.id === c.id);

  if (index >= 0) {
    cases[index] = payload;
  } else {
    cases.unshift(payload);
  }

  writeCases(cases);
  return payload;
}

export function updateCase(id: string, patch: Partial<Case>): Case {
  const existing = getCase(id);
  if (!existing) {
    throw new Error(`Case with id ${id} not found`);
  }

  return saveCase({
    ...existing,
    ...patch,
    id: existing.id,
    created_at: existing.created_at
  });
}

export function deleteCase(id: string): void {
  const nextCases = dedupeCasesById(parseCases()).filter((item) => item.id !== id);
  writeCases(nextCases);
}

export function deleteCases(ids: string[]): void {
  const targets = new Set(ids);
  const nextCases = dedupeCasesById(parseCases()).filter((item) => !targets.has(item.id));
  writeCases(nextCases);
}

export function clearAllCases(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
