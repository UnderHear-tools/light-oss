export interface FolderUploadManifestItem {
  file_field: string;
  relative_path: string;
}

export function getFolderRelativePath(file: File) {
  const relativePath =
    "webkitRelativePath" in file && typeof file.webkitRelativePath === "string"
      ? file.webkitRelativePath
      : "";
  const normalizedPath = relativePath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();

  if (!normalizedPath) {
    throw new Error("Folder upload requires relative paths");
  }

  return normalizedPath;
}

export function buildFolderUploadManifest(files: File[]) {
  return files.map<FolderUploadManifestItem>((file, index) => ({
    file_field: `file_${index}`,
    relative_path: getFolderRelativePath(file),
  }));
}

export function getFolderUploadTopLevelName(files: File[]) {
  const [firstFile] = files;
  if (!firstFile) {
    return "";
  }

  const [topLevelName = ""] = getFolderRelativePath(firstFile).split("/");
  return topLevelName.trim();
}

export function normalizeFolderUploadParentPrefix(value: string) {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!normalized) {
    return "";
  }

  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}
