export interface CaseItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
}

export interface AttachmentMeta {
  id: string;
  name: string;
  size: number;
  mime_type: string;
}

export interface Case {
  id: string;
  case_no: string;
  title: string;
  request_date: string;
  department: string;
  requester: string;
  vendor: string;
  vat_enabled: boolean;
  vat_rate: number;
  items: CaseItem[];
  attachments: AttachmentMeta[];
  status: 'draft' | 'generated';
  created_at: string;
  updated_at: string;
}
