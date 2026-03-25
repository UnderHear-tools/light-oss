import { FormEvent, useState } from "react";
import type { ObjectVisibility } from "../../api/types";

export interface UploadFormValue {
  objectKey: string;
  file: File;
  visibility: ObjectVisibility;
}

export function UploadPanel({
  pending,
  progress,
  onSubmit,
}: {
  pending: boolean;
  progress: number;
  onSubmit: (value: UploadFormValue) => Promise<void>;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [objectKey, setObjectKey] = useState("");
  const [visibility, setVisibility] = useState<ObjectVisibility>("private");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      return;
    }

    const form = event.currentTarget;
    const key = objectKey.trim() || selectedFile.name;
    await onSubmit({
      objectKey: key,
      file: selectedFile,
      visibility,
    });

    setSelectedFile(null);
    setObjectKey("");
    setVisibility("private");
    const input = form.elements.namedItem(
      "upload-file",
    ) as HTMLInputElement | null;
    if (input) {
      input.value = "";
    }
  }

  return (
    <form className="panel form-grid" onSubmit={handleSubmit}>
      <div className="panel__header">
        <h2>Upload Object</h2>
        <span>PUT stream + header metadata</span>
      </div>
      <div>
        <label htmlFor="upload-file">File</label>
        <input
          id="upload-file"
          name="upload-file"
          type="file"
          onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          disabled={pending}
        />
      </div>
      <div>
        <label htmlFor="object-key">Object Key</label>
        <input
          id="object-key"
          value={objectKey}
          onChange={(event) => setObjectKey(event.target.value)}
          placeholder="folder/demo.txt"
          disabled={pending}
        />
      </div>
      <div>
        <label htmlFor="visibility">Visibility</label>
        <select
          id="visibility"
          value={visibility}
          onChange={(event) =>
            setVisibility(event.target.value as ObjectVisibility)
          }
          disabled={pending}
        >
          <option value="private">private</option>
          <option value="public">public</option>
        </select>
      </div>
      {pending ? (
        <div className="progress">
          <div className="progress__bar" style={{ width: `${progress}%` }} />
          <span>{progress}%</span>
        </div>
      ) : null}
      <button
        className="button"
        type="submit"
        disabled={pending || !selectedFile}
      >
        {pending ? "Uploading..." : "Upload Object"}
      </button>
    </form>
  );
}
