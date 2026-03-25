export type ObjectVisibility = "public" | "private";

export interface ApiErrorBody {
  code: string;
  message: string;
}

export interface ApiEnvelope<T> {
  request_id: string;
  data: T;
  error?: ApiErrorBody;
}

export interface Bucket {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface BucketListResult {
  items: Bucket[];
}

export interface ObjectItem {
  id: number;
  bucket_name: string;
  object_key: string;
  original_filename: string;
  size: number;
  content_type: string;
  etag: string;
  visibility: ObjectVisibility;
  created_at: string;
  updated_at: string;
}

export interface ObjectListResult {
  items: ObjectItem[];
  next_cursor: string;
}

export interface SignedDownloadResult {
  url: string;
  expires_at: number;
}
