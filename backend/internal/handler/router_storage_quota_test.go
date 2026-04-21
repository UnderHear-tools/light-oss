package handler_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
)

func TestProtectedUpdateStorageQuotaRequiresAuth(t *testing.T) {
	router := newTestRouter(t, 1024)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/system/storage/quota", bytes.NewBufferString(`{"max_bytes":2147483648}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestProtectedUpdateStorageQuotaUpdatesStatsSnapshot(t *testing.T) {
	router := newTestRouter(t, 1024)

	updateStorageQuota(t, router, 2*1024*1024*1024)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/system/stats", nil)
	req.Header.Set("Authorization", "Bearer dev-token")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", rec.Code, rec.Body.String())
	}

	var body apiEnvelope[systemStatsResponse]
	decodeJSON(t, rec.Body.Bytes(), &body)
	if body.Data.Storage.MaxBytes != 2*1024*1024*1024 {
		t.Fatalf("expected updated max bytes, got %d", body.Data.Storage.MaxBytes)
	}
}

func TestProtectedUpdateStorageQuotaRejectsBelowUsage(t *testing.T) {
	router := newTestRouter(t, 1024)

	createBucket(t, router, "quota-usage")
	uploadObject(t, router, "/api/v1/buckets/quota-usage/objects/docs/report.txt", "12345", "public")

	req := httptest.NewRequest(http.MethodPut, "/api/v1/system/storage/quota", bytes.NewBufferString(`{"max_bytes":1}`))
	req.Header.Set("Authorization", "Bearer dev-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d, body=%s", rec.Code, rec.Body.String())
	}
	assertAPIErrorCode(t, rec.Body.Bytes(), "storage_limit_below_usage")
}

func TestProtectedSystemStatsReturnsStorageWarningStatus(t *testing.T) {
	router := newTestRouter(t, 1024)

	createBucket(t, router, "quota-warning")
	uploadObject(t, router, "/api/v1/buckets/quota-warning/objects/docs/report.txt", "12345678", "public")
	updateStorageQuota(t, router, 10)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/system/stats", nil)
	req.Header.Set("Authorization", "Bearer dev-token")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", rec.Code, rec.Body.String())
	}

	var body apiEnvelope[systemStatsResponse]
	decodeJSON(t, rec.Body.Bytes(), &body)

	if body.Data.Storage.LimitStatus != "warning" {
		t.Fatalf("expected storage limit status warning, got %q", body.Data.Storage.LimitStatus)
	}
}

func TestUploadObjectReturnsStorageLimitExceeded(t *testing.T) {
	router, storageRoot := newTestRouterWithStorageRoot(t, 1024)

	createBucket(t, router, "quota-file")
	updateStorageQuota(t, router, 4)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/quota-file/objects/docs/oversized.txt", bytes.NewBufferString("12345"))
	req.Header.Set("Authorization", "Bearer dev-token")
	req.Header.Set("X-Object-Visibility", "public")
	req.Header.Set("X-Original-Filename", "oversized.txt")
	req.Header.Set("Content-Type", "text/plain")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusInsufficientStorage {
		t.Fatalf("expected 507, got %d, body=%s", rec.Code, rec.Body.String())
	}
	assertAPIErrorCode(t, rec.Body.Bytes(), "storage_limit_exceeded")
	if files := countFilesUnderRoot(t, storageRoot); files != 0 {
		t.Fatalf("expected no stored files after rejected upload, got %d", files)
	}
}

func TestUploadObjectBatchReturnsStorageLimitExceeded(t *testing.T) {
	router, storageRoot := newTestRouterWithStorageRoot(t, 1024)

	createBucket(t, router, "quota-batch")
	updateStorageQuota(t, router, 4)

	req := newMultipartBatchUploadRequest(
		t,
		"/api/v1/buckets/quota-batch/objects/batch",
		map[string]string{
			"prefix":     "docs/",
			"visibility": "public",
			"manifest":   mustMarshalJSON(t, []map[string]string{{"file_field": "file_0", "relative_path": "oversized.txt"}}),
		},
		map[string]multipartUploadFile{
			"file_0": {Filename: "oversized.txt", Content: "12345", ContentType: "text/plain"},
		},
	)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusInsufficientStorage {
		t.Fatalf("expected 507, got %d, body=%s", rec.Code, rec.Body.String())
	}
	assertAPIErrorCode(t, rec.Body.Bytes(), "storage_limit_exceeded")
	if files := countFilesUnderRoot(t, storageRoot); files != 0 {
		t.Fatalf("expected no stored files after rejected batch upload, got %d", files)
	}
}

func TestOverwriteUploadReclaimsOldStorageFile(t *testing.T) {
	router, storageRoot := newTestRouterWithStorageRoot(t, 1024)

	createBucket(t, router, "overwrite-cleanup")
	uploadObject(t, router, "/api/v1/buckets/overwrite-cleanup/objects/docs/readme.txt", "old", "public")
	if files := countFilesUnderRoot(t, storageRoot); files != 1 {
		t.Fatalf("expected 1 stored file before overwrite, got %d", files)
	}

	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/overwrite-cleanup/objects/docs/readme.txt", bytes.NewBufferString("new-content"))
	req.Header.Set("Authorization", "Bearer dev-token")
	req.Header.Set("X-Object-Visibility", "public")
	req.Header.Set("X-Original-Filename", "readme.txt")
	req.Header.Set("X-Allow-Overwrite", "true")
	req.Header.Set("Content-Type", "text/plain")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d, body=%s", rec.Code, rec.Body.String())
	}
	if files := countFilesUnderRoot(t, storageRoot); files != 1 {
		t.Fatalf("expected overwrite to keep exactly 1 stored file, got %d", files)
	}
}

func TestDeleteObjectMovesToRecycleBinAndKeepsStorageFile(t *testing.T) {
	router, storageRoot := newTestRouterWithStorageRoot(t, 1024)

	createBucket(t, router, "delete-cleanup")
	uploadObject(t, router, "/api/v1/buckets/delete-cleanup/objects/docs/readme.txt", "hello", "public")

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/buckets/delete-cleanup/objects/docs/readme.txt", nil)
	req.Header.Set("Authorization", "Bearer dev-token")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d, body=%s", rec.Code, rec.Body.String())
	}
	if files := countFilesUnderRoot(t, storageRoot); files != 1 {
		t.Fatalf("expected storage file to remain after soft delete, got %d", files)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/recycle-bin/objects", nil)
	listReq.Header.Set("Authorization", "Bearer dev-token")
	listRec := httptest.NewRecorder()
	router.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", listRec.Code, listRec.Body.String())
	}

	var listBody apiEnvelope[recycleBinListResponse]
	decodeJSON(t, listRec.Body.Bytes(), &listBody)
	if len(listBody.Data.Items) != 1 || listBody.Data.Items[0].Path != "docs/readme.txt" {
		t.Fatalf("expected deleted file in recycle bin, got %+v", listBody.Data.Items)
	}
}

func TestListRecycleBinObjectsFiltersByBucket(t *testing.T) {
	router := newTestRouter(t, 1024)

	createBucket(t, router, "bucket-a")
	createBucket(t, router, "bucket-b")
	uploadObject(t, router, "/api/v1/buckets/bucket-a/objects/docs/a.txt", "A", "public")
	uploadObject(t, router, "/api/v1/buckets/bucket-b/objects/docs/b.txt", "B", "public")

	deleteAReq := httptest.NewRequest(http.MethodDelete, "/api/v1/buckets/bucket-a/objects/docs/a.txt", nil)
	deleteAReq.Header.Set("Authorization", "Bearer dev-token")
	deleteARec := httptest.NewRecorder()
	router.ServeHTTP(deleteARec, deleteAReq)
	if deleteARec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d, body=%s", deleteARec.Code, deleteARec.Body.String())
	}

	deleteBReq := httptest.NewRequest(http.MethodDelete, "/api/v1/buckets/bucket-b/objects/docs/b.txt", nil)
	deleteBReq.Header.Set("Authorization", "Bearer dev-token")
	deleteBRec := httptest.NewRecorder()
	router.ServeHTTP(deleteBRec, deleteBReq)
	if deleteBRec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d, body=%s", deleteBRec.Code, deleteBRec.Body.String())
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/recycle-bin/objects?bucket=bucket-a", nil)
	listReq.Header.Set("Authorization", "Bearer dev-token")
	listRec := httptest.NewRecorder()
	router.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", listRec.Code, listRec.Body.String())
	}

	var listBody apiEnvelope[recycleBinListResponse]
	decodeJSON(t, listRec.Body.Bytes(), &listBody)
	if len(listBody.Data.Items) != 1 {
		t.Fatalf("expected 1 recycle bin item, got %+v", listBody.Data.Items)
	}
	if listBody.Data.Items[0].BucketName != "bucket-a" || listBody.Data.Items[0].Path != "docs/a.txt" {
		t.Fatalf("expected only bucket-a items, got %+v", listBody.Data.Items)
	}
}

func TestDeleteFolderMovesObjectsToRecycleBinAndKeepsStorageFiles(t *testing.T) {
	router, storageRoot := newTestRouterWithStorageRoot(t, 1024)

	createBucket(t, router, "folder-cleanup")
	createFolder(t, router, "folder-cleanup", "", "docs")
	uploadObject(t, router, "/api/v1/buckets/folder-cleanup/objects/docs/a.txt", "A", "public")
	uploadObject(t, router, "/api/v1/buckets/folder-cleanup/objects/docs/b.txt", "B", "public")

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/buckets/folder-cleanup/folders?path=docs/&recursive=true", nil)
	req.Header.Set("Authorization", "Bearer dev-token")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d, body=%s", rec.Code, rec.Body.String())
	}
	if files := countFilesUnderRoot(t, storageRoot); files != 3 {
		t.Fatalf("expected storage files to remain after recursive folder delete, got %d", files)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/recycle-bin/objects", nil)
	listReq.Header.Set("Authorization", "Bearer dev-token")
	listRec := httptest.NewRecorder()
	router.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", listRec.Code, listRec.Body.String())
	}

	var listBody apiEnvelope[recycleBinListResponse]
	decodeJSON(t, listRec.Body.Bytes(), &listBody)
	if len(listBody.Data.Items) != 3 {
		t.Fatalf("expected 3 recycle bin items, got %d", len(listBody.Data.Items))
	}

	itemByPath := make(map[string]recycleBinObjectResponse, len(listBody.Data.Items))
	for _, item := range listBody.Data.Items {
		itemByPath[item.Path] = item
	}

	if _, exists := itemByPath["docs/"]; !exists {
		t.Fatalf("expected directory marker in recycle bin, got %+v", listBody.Data.Items)
	}
	if itemByPath["docs/"].Type != "directory" {
		t.Fatalf("expected docs/ to be a directory recycle bin item, got %+v", itemByPath["docs/"])
	}
	if _, exists := itemByPath["docs/a.txt"]; !exists {
		t.Fatalf("expected docs/a.txt in recycle bin")
	}
	if _, exists := itemByPath["docs/b.txt"]; !exists {
		t.Fatalf("expected docs/b.txt in recycle bin")
	}
}

func TestRecycleBinRestoreRestoresObject(t *testing.T) {
	router, storageRoot := newTestRouterWithStorageRoot(t, 1024)

	createBucket(t, router, "restore-bucket")
	uploadObject(t, router, "/api/v1/buckets/restore-bucket/objects/docs/readme.txt", "hello", "public")

	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/v1/buckets/restore-bucket/objects/docs/readme.txt", nil)
	deleteReq.Header.Set("Authorization", "Bearer dev-token")
	deleteRec := httptest.NewRecorder()
	router.ServeHTTP(deleteRec, deleteReq)
	if deleteRec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d, body=%s", deleteRec.Code, deleteRec.Body.String())
	}

	var recycleItem recycleBinObjectResponse
	{
		listReq := httptest.NewRequest(http.MethodGet, "/api/v1/recycle-bin/objects", nil)
		listReq.Header.Set("Authorization", "Bearer dev-token")
		listRec := httptest.NewRecorder()
		router.ServeHTTP(listRec, listReq)
		if listRec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d, body=%s", listRec.Code, listRec.Body.String())
		}

		var listBody apiEnvelope[recycleBinListResponse]
		decodeJSON(t, listRec.Body.Bytes(), &listBody)
		if len(listBody.Data.Items) != 1 {
			t.Fatalf("expected 1 recycle bin item, got %d", len(listBody.Data.Items))
		}
		recycleItem = listBody.Data.Items[0]
	}

	restoreReq := httptest.NewRequest(
		http.MethodPost,
		"/api/v1/recycle-bin/objects/restore",
		bytes.NewBufferString(`{"item_ids":[`+strconv.FormatUint(recycleItem.ID, 10)+`]}`),
	)
	restoreReq.Header.Set("Authorization", "Bearer dev-token")
	restoreReq.Header.Set("Content-Type", "application/json")
	restoreRec := httptest.NewRecorder()
	router.ServeHTTP(restoreRec, restoreReq)
	if restoreRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", restoreRec.Code, restoreRec.Body.String())
	}

	var restoreBody apiEnvelope[recycleBinBatchResponse]
	decodeJSON(t, restoreRec.Body.Bytes(), &restoreBody)
	if restoreBody.Data.RestoredCount != 1 || restoreBody.Data.FailedCount != 0 {
		t.Fatalf("unexpected restore result %+v", restoreBody.Data)
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/restore-bucket/objects/docs/readme.txt", nil)
	getRec := httptest.NewRecorder()
	router.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("expected restored object to be downloadable, got %d", getRec.Code)
	}
	if body := getRec.Body.String(); body != "hello" {
		t.Fatalf("unexpected restored body %q", body)
	}
	if files := countFilesUnderRoot(t, storageRoot); files != 1 {
		t.Fatalf("expected restored object to reuse existing storage file, got %d", files)
	}
}

func TestRecycleBinRestoreConflictReturnsFailedItem(t *testing.T) {
	router := newTestRouter(t, 1024)

	createBucket(t, router, "restore-conflict")
	uploadObject(t, router, "/api/v1/buckets/restore-conflict/objects/docs/readme.txt", "hello", "public")

	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/v1/buckets/restore-conflict/objects/docs/readme.txt", nil)
	deleteReq.Header.Set("Authorization", "Bearer dev-token")
	deleteRec := httptest.NewRecorder()
	router.ServeHTTP(deleteRec, deleteReq)
	if deleteRec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d, body=%s", deleteRec.Code, deleteRec.Body.String())
	}

	uploadObject(t, router, "/api/v1/buckets/restore-conflict/objects/docs/readme.txt", "replacement", "public")

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/recycle-bin/objects", nil)
	listReq.Header.Set("Authorization", "Bearer dev-token")
	listRec := httptest.NewRecorder()
	router.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", listRec.Code, listRec.Body.String())
	}

	var listBody apiEnvelope[recycleBinListResponse]
	decodeJSON(t, listRec.Body.Bytes(), &listBody)
	if len(listBody.Data.Items) != 1 {
		t.Fatalf("expected 1 recycle bin item, got %d", len(listBody.Data.Items))
	}

	restoreReq := httptest.NewRequest(
		http.MethodPost,
		"/api/v1/recycle-bin/objects/restore",
		bytes.NewBufferString(`{"item_ids":[`+strconv.FormatUint(listBody.Data.Items[0].ID, 10)+`]}`),
	)
	restoreReq.Header.Set("Authorization", "Bearer dev-token")
	restoreReq.Header.Set("Content-Type", "application/json")
	restoreRec := httptest.NewRecorder()
	router.ServeHTTP(restoreRec, restoreReq)
	if restoreRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", restoreRec.Code, restoreRec.Body.String())
	}

	var restoreBody apiEnvelope[recycleBinBatchResponse]
	decodeJSON(t, restoreRec.Body.Bytes(), &restoreBody)
	if restoreBody.Data.RestoredCount != 0 || restoreBody.Data.FailedCount != 1 {
		t.Fatalf("unexpected restore result %+v", restoreBody.Data)
	}
	if len(restoreBody.Data.FailedItems) != 1 || restoreBody.Data.FailedItems[0].Code != "object_exists" {
		t.Fatalf("expected object_exists failure, got %+v", restoreBody.Data.FailedItems)
	}

	var restoreRaw apiEnvelope[map[string]any]
	decodeJSON(t, restoreRec.Body.Bytes(), &restoreRaw)
	if _, exists := restoreRaw.Data["restored_count"]; !exists {
		t.Fatalf("expected restored_count field to be present, got %+v", restoreRaw.Data)
	}
}

func TestRecycleBinPermanentDeleteReclaimsStorageFile(t *testing.T) {
	router, storageRoot := newTestRouterWithStorageRoot(t, 1024)

	createBucket(t, router, "recycle-delete")
	uploadObject(t, router, "/api/v1/buckets/recycle-delete/objects/docs/readme.txt", "hello", "public")

	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/v1/buckets/recycle-delete/objects/docs/readme.txt", nil)
	deleteReq.Header.Set("Authorization", "Bearer dev-token")
	deleteRec := httptest.NewRecorder()
	router.ServeHTTP(deleteRec, deleteReq)
	if deleteRec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d, body=%s", deleteRec.Code, deleteRec.Body.String())
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/recycle-bin/objects", nil)
	listReq.Header.Set("Authorization", "Bearer dev-token")
	listRec := httptest.NewRecorder()
	router.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", listRec.Code, listRec.Body.String())
	}

	var listBody apiEnvelope[recycleBinListResponse]
	decodeJSON(t, listRec.Body.Bytes(), &listBody)
	if len(listBody.Data.Items) != 1 {
		t.Fatalf("expected 1 recycle bin item, got %d", len(listBody.Data.Items))
	}

	deleteRecycleReq := httptest.NewRequest(
		http.MethodPost,
		"/api/v1/recycle-bin/objects/batch-delete",
		bytes.NewBufferString(`{"item_ids":[`+strconv.FormatUint(listBody.Data.Items[0].ID, 10)+`]}`),
	)
	deleteRecycleReq.Header.Set("Authorization", "Bearer dev-token")
	deleteRecycleReq.Header.Set("Content-Type", "application/json")
	deleteRecycleRec := httptest.NewRecorder()
	router.ServeHTTP(deleteRecycleRec, deleteRecycleReq)
	if deleteRecycleRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", deleteRecycleRec.Code, deleteRecycleRec.Body.String())
	}

	var deleteBody apiEnvelope[recycleBinBatchResponse]
	decodeJSON(t, deleteRecycleRec.Body.Bytes(), &deleteBody)
	if deleteBody.Data.DeletedCount != 1 || deleteBody.Data.FailedCount != 0 {
		t.Fatalf("unexpected delete result %+v", deleteBody.Data)
	}
	if files := countFilesUnderRoot(t, storageRoot); files != 0 {
		t.Fatalf("expected storage file to be removed after permanent delete, got %d", files)
	}
}

func TestDeleteBucketClearsRecycleBinAndReclaimsStorageFiles(t *testing.T) {
	router, storageRoot := newTestRouterWithStorageRoot(t, 1024)

	createBucket(t, router, "bucket-delete")
	uploadObject(t, router, "/api/v1/buckets/bucket-delete/objects/docs/readme.txt", "hello", "public")

	deleteObjectReq := httptest.NewRequest(http.MethodDelete, "/api/v1/buckets/bucket-delete/objects/docs/readme.txt", nil)
	deleteObjectReq.Header.Set("Authorization", "Bearer dev-token")
	deleteObjectRec := httptest.NewRecorder()
	router.ServeHTTP(deleteObjectRec, deleteObjectReq)
	if deleteObjectRec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d, body=%s", deleteObjectRec.Code, deleteObjectRec.Body.String())
	}

	deleteBucketReq := httptest.NewRequest(http.MethodDelete, "/api/v1/buckets/bucket-delete", nil)
	deleteBucketReq.Header.Set("Authorization", "Bearer dev-token")
	deleteBucketRec := httptest.NewRecorder()
	router.ServeHTTP(deleteBucketRec, deleteBucketReq)
	if deleteBucketRec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d, body=%s", deleteBucketRec.Code, deleteBucketRec.Body.String())
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/recycle-bin/objects", nil)
	listReq.Header.Set("Authorization", "Bearer dev-token")
	listRec := httptest.NewRecorder()
	router.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", listRec.Code, listRec.Body.String())
	}

	var listBody apiEnvelope[recycleBinListResponse]
	decodeJSON(t, listRec.Body.Bytes(), &listBody)
	if len(listBody.Data.Items) != 0 {
		t.Fatalf("expected recycle bin to be empty after bucket delete, got %+v", listBody.Data.Items)
	}
	if files := countFilesUnderRoot(t, storageRoot); files != 0 {
		t.Fatalf("expected bucket delete to reclaim storage files, got %d", files)
	}
}

func TestCreateFolderReturnsStorageLimitExceededWhenUsageIsAtLimit(t *testing.T) {
	router, storageRoot := newTestRouterWithStorageRoot(t, 1024)

	createBucket(t, router, "quota-folder")
	uploadObject(t, router, "/api/v1/buckets/quota-folder/objects/docs/report.txt", "12345", "public")
	updateStorageQuota(t, router, 5)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/buckets/quota-folder/folders", bytes.NewBufferString(`{"prefix":"","name":"empty"}`))
	req.Header.Set("Authorization", "Bearer dev-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusInsufficientStorage {
		t.Fatalf("expected 507, got %d, body=%s", rec.Code, rec.Body.String())
	}
	assertAPIErrorCode(t, rec.Body.Bytes(), "storage_limit_exceeded")
	if files := countFilesUnderRoot(t, storageRoot); files != 1 {
		t.Fatalf("expected only the original file to remain after rejected folder create, got %d", files)
	}
}

func updateStorageQuota(t *testing.T, router http.Handler, maxBytes int64) {
	t.Helper()

	req := httptest.NewRequest(http.MethodPut, "/api/v1/system/storage/quota", bytes.NewBufferString(`{"max_bytes":`+strconv.FormatInt(maxBytes, 10)+`}`))
	req.Header.Set("Authorization", "Bearer dev-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("update storage quota expected 200, got %d, body=%s", rec.Code, rec.Body.String())
	}
}
