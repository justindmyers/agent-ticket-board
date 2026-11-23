export type Collapsed = Record<string, boolean>;

export type SetCollapsed = (f: (c: Collapsed) => Collapsed) => void;
