export const isTyping = (el: Element | null) => /TEXTAREA|INPUT/.test(el?.tagName ?? '');
