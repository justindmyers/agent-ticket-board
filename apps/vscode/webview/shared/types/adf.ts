export type AdfAttrs = {
  href?: string;
  text?: string;
  url?: string;
  level?: number;
  language?: string;
};

export type AdfNode = {
  type: string;
  text?: string;
  attrs?: AdfAttrs;
  marks?: { type: string; attrs?: AdfAttrs }[];
  content?: AdfNode[];
};

export type AdfSection = {
  title: string | null;
  kind: 'context' | 'acceptance' | 'notes' | 'other';
  html: string;
};
