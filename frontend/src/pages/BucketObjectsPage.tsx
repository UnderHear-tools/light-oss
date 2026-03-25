import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  buildPublicObjectURL,
  createSignedDownloadURL,
  deleteObject,
  listObjects,
  uploadObject,
} from "../api/objects";
import { EmptyState } from "../components/EmptyState";
import { useToast } from "../components/ToastProvider";
import { ObjectTable } from "../features/objects/ObjectTable";
import {
  UploadPanel,
  type UploadFormValue,
} from "../features/objects/UploadPanel";
import { useAppSettings } from "../lib/settings";

const pageSize = 10;

export function BucketObjectsPage() {
  const { bucket = "" } = useParams();
  const { settings } = useAppSettings();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [prefixInput, setPrefixInput] = useState("");
  const [prefix, setPrefix] = useState("");
  const [cursor, setCursor] = useState("");
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deletingKey, setDeletingKey] = useState("");
  const [signingKey, setSigningKey] = useState("");

  const objectsQuery = useQuery({
    queryKey: [
      "objects",
      settings.apiBaseUrl,
      settings.bearerToken,
      bucket,
      prefix,
      cursor,
    ],
    queryFn: () =>
      listObjects(settings, {
        bucket,
        prefix,
        limit: pageSize,
        cursor,
      }),
    enabled: bucket !== "",
  });

  const uploadMutation = useMutation({
    mutationFn: (value: UploadFormValue) =>
      uploadObject(settings, {
        bucket,
        objectKey: value.objectKey,
        file: value.file,
        visibility: value.visibility,
        onProgress: setUploadProgress,
      }),
    onSuccess: async () => {
      setUploadProgress(0);
      pushToast("success", "Object uploaded");
      await queryClient.invalidateQueries({
        queryKey: [
          "objects",
          settings.apiBaseUrl,
          settings.bearerToken,
          bucket,
        ],
      });
    },
    onError: (error) => {
      setUploadProgress(0);
      const message = error instanceof Error ? error.message : "Upload failed";
      pushToast("error", message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (objectKey: string) => {
      setDeletingKey(objectKey);
      await deleteObject(settings, bucket, objectKey);
    },
    onSuccess: async () => {
      pushToast("success", "Object deleted");
      await queryClient.invalidateQueries({
        queryKey: [
          "objects",
          settings.apiBaseUrl,
          settings.bearerToken,
          bucket,
        ],
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Delete failed";
      pushToast("error", message);
    },
    onSettled: () => {
      setDeletingKey("");
    },
  });

  const signMutation = useMutation({
    mutationFn: async (objectKey: string) => {
      setSigningKey(objectKey);
      return createSignedDownloadURL(settings, bucket, objectKey, 300);
    },
    onSuccess: (result) => {
      window.open(result.url, "_blank", "noopener");
      pushToast("success", "Signed download URL created");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Signing failed";
      pushToast("error", message);
    },
    onSettled: () => {
      setSigningKey("");
    },
  });

  async function handleUpload(value: UploadFormValue) {
    await uploadMutation.mutateAsync(value);
  }

  async function handleDelete(objectKey: string) {
    await deleteMutation.mutateAsync(objectKey);
  }

  async function handleSignDownload(objectKey: string) {
    await signMutation.mutateAsync(objectKey);
  }

  function applyPrefixFilter() {
    setCursor("");
    setCursorHistory([]);
    setPrefix(prefixInput.trim());
  }

  function handleNextPage() {
    if (!objectsQuery.data?.next_cursor) {
      return;
    }

    setCursorHistory((history) => [...history, cursor]);
    setCursor(objectsQuery.data.next_cursor);
  }

  function handlePrevPage() {
    if (cursorHistory.length === 0) {
      return;
    }

    const nextHistory = [...cursorHistory];
    const previousCursor = nextHistory.pop() ?? "";
    setCursorHistory(nextHistory);
    setCursor(previousCursor);
  }

  if (!bucket) {
    return (
      <EmptyState
        title="Bucket not found"
        description="Open the page again from the bucket list."
      />
    );
  }

  return (
    <section className="page-grid">
      <div className="panel">
        <div className="panel__header">
          <h2>{bucket}</h2>
          <span>Prefix + cursor pagination</span>
        </div>
        <div className="filter-row">
          <input
            aria-label="Prefix"
            value={prefixInput}
            onChange={(event) => setPrefixInput(event.target.value)}
            placeholder="prefix, for example docs/"
          />
          <button
            className="button button--ghost"
            type="button"
            onClick={applyPrefixFilter}
          >
            Apply Filter
          </button>
        </div>
      </div>
      <UploadPanel
        pending={uploadMutation.isPending}
        progress={uploadProgress}
        onSubmit={handleUpload}
      />
      {objectsQuery.isLoading ? (
        <div className="panel">Loading objects...</div>
      ) : null}
      {objectsQuery.isError ? (
        <div className="panel">Load failed: {objectsQuery.error.message}</div>
      ) : null}
      {objectsQuery.data && objectsQuery.data.items.length > 0 ? (
        <>
          <ObjectTable
            items={objectsQuery.data.items}
            onDelete={handleDelete}
            onSignDownload={handleSignDownload}
            buildPublicUrl={(objectKey) =>
              buildPublicObjectURL(settings.apiBaseUrl, bucket, objectKey)
            }
            deletingKey={deletingKey}
            signingKey={signingKey}
          />
          <div className="panel pagination">
            <button
              className="button button--ghost"
              type="button"
              onClick={handlePrevPage}
              disabled={cursorHistory.length === 0}
            >
              Previous Page
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={handleNextPage}
              disabled={!objectsQuery.data.next_cursor}
            >
              Next Page
            </button>
          </div>
        </>
      ) : null}
      {objectsQuery.data && objectsQuery.data.items.length === 0 ? (
        <EmptyState
          title="No objects in this bucket"
          description="Upload a file or adjust the prefix filter to see more results."
        />
      ) : null}
    </section>
  );
}
