export const explorerPageSizes = [50, 100, 200] as const;

export function normalizeExplorerPrefix(value: string | null | undefined) {
  const trimmed = (value ?? "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed ? `${trimmed}/` : "";
}

export function normalizeExplorerSearch(value: string | null | undefined) {
  return (value ?? "").trim();
}

export function parseExplorerLimit(value: string | null | undefined) {
  const limit = Number(value ?? "");
  if (explorerPageSizes.includes(limit as (typeof explorerPageSizes)[number])) {
    return limit as (typeof explorerPageSizes)[number];
  }

  return 100;
}

export function getExplorerBreadcrumbs(prefix: string) {
  const normalized = normalizeExplorerPrefix(prefix);
  if (!normalized) {
    return [];
  }

  const segments = normalized.split("/").filter(Boolean);
  return segments.map((segment, index) => ({
    label: segment,
    prefix: `${segments.slice(0, index + 1).join("/")}/`,
  }));
}

export function getParentExplorerPrefix(prefix: string) {
  const normalized = normalizeExplorerPrefix(prefix);
  if (!normalized) {
    return "";
  }

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return "";
  }

  return `${segments.slice(0, -1).join("/")}/`;
}

export function joinExplorerPath(prefix: string, name: string) {
  const normalizedPrefix = normalizeExplorerPrefix(prefix);
  const normalizedName = name.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return normalizedName ? `${normalizedPrefix}${normalizedName}` : normalizedPrefix;
}

export function isExplorerPrefixAncestor(ancestor: string, current: string) {
  const normalizedAncestor = normalizeExplorerPrefix(ancestor);
  const normalizedCurrent = normalizeExplorerPrefix(current);
  if (!normalizedAncestor) {
    return true;
  }

  return normalizedCurrent.startsWith(normalizedAncestor);
}
