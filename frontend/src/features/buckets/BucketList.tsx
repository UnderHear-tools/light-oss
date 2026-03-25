import { Link } from "react-router-dom";
import type { Bucket } from "../../api/types";

export function BucketList({ buckets }: { buckets: Bucket[] }) {
  return (
    <div className="panel">
      <div className="panel__header">
        <h2>Bucket List</h2>
        <span>{buckets.length} total</span>
      </div>
      <div className="list">
        {buckets.map((bucket) => (
          <Link
            key={bucket.id}
            className="list__item"
            to={`/buckets/${bucket.name}`}
          >
            <strong>{bucket.name}</strong>
            <span>Open Bucket</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
