import type { ObjectItem } from "../../api/types";
import { formatBytes, formatDate } from "../../lib/format";

export function ObjectTable({
  items,
  onDelete,
  onSignDownload,
  buildPublicUrl,
  deletingKey,
  signingKey,
}: {
  items: ObjectItem[];
  onDelete: (key: string) => Promise<void>;
  onSignDownload: (key: string) => Promise<void>;
  buildPublicUrl: (key: string) => string;
  deletingKey: string;
  signingKey: string;
}) {
  return (
    <div className="panel">
      <div className="panel__header">
        <h2>Objects</h2>
        <span>{items.length} total</span>
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Object Key</th>
              <th>Size</th>
              <th>ETag</th>
              <th>Visibility</th>
              <th>Created At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.object_key}</td>
                <td>{formatBytes(item.size)}</td>
                <td className="mono">{item.etag.slice(0, 12)}...</td>
                <td>{item.visibility}</td>
                <td>{formatDate(item.created_at)}</td>
                <td>
                  <div className="action-row">
                    {item.visibility === "public" ? (
                      <a
                        className="button button--ghost"
                        href={buildPublicUrl(item.object_key)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Direct Download
                      </a>
                    ) : (
                      <button
                        className="button button--ghost"
                        onClick={() => void onSignDownload(item.object_key)}
                        disabled={signingKey === item.object_key}
                        type="button"
                      >
                        {signingKey === item.object_key
                          ? "Signing..."
                          : "Signed Download"}
                      </button>
                    )}
                    <button
                      className="button button--danger"
                      onClick={() => void onDelete(item.object_key)}
                      disabled={deletingKey === item.object_key}
                      type="button"
                    >
                      {deletingKey === item.object_key
                        ? "Deleting..."
                        : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
