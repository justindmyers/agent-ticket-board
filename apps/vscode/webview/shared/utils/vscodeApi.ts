declare function acquireVsCodeApi(): {
  postMessage(m: unknown): void;
  getState(): Record<string, unknown> | undefined;
  setState(s: unknown): void;
};

export const vscodeApi = acquireVsCodeApi();

export const send = (m: Record<string, unknown>) => vscodeApi.postMessage(m);
