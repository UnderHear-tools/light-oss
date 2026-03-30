package handler_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"light-oss/backend/internal/config"
	"light-oss/backend/internal/handler"
	"light-oss/backend/internal/middleware"
	"light-oss/backend/internal/model"
	"light-oss/backend/internal/repository"
	"light-oss/backend/internal/service"
	"light-oss/backend/internal/signing"
	"light-oss/backend/internal/storage"
)

type apiEnvelope[T any] struct {
	Data  T             `json:"data"`
	Error *apiErrorBody `json:"error"`
}

type apiErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type bucketResponse struct {
	ID   uint64 `json:"id"`
	Name string `json:"name"`
}

type bucketListResponse struct {
	Items []bucketResponse `json:"items"`
}

type objectResponse struct {
	ObjectKey        string `json:"object_key"`
	OriginalFilename string `json:"original_filename"`
	Visibility       string `json:"visibility"`
	Size             int64  `json:"size"`
}

type objectListResponse struct {
	Items      []objectResponse `json:"items"`
	NextCursor string           `json:"next_cursor"`
}

type folderNodeResponse struct {
	Path       string `json:"path"`
	Name       string `json:"name"`
	ParentPath string `json:"parent_path"`
}

type folderListResponse struct {
	Items []folderNodeResponse `json:"items"`
}

type explorerEntryResponse struct {
	Type      string  `json:"type"`
	Path      string  `json:"path"`
	Name      string  `json:"name"`
	IsEmpty   *bool   `json:"is_empty"`
	ObjectKey *string `json:"object_key"`
}

type explorerListResponse struct {
	Items      []explorerEntryResponse `json:"items"`
	NextCursor string                  `json:"next_cursor"`
}

type signResponse struct {
	URL string `json:"url"`
}

type siteResponse struct {
	ID            uint64   `json:"id"`
	Bucket        string   `json:"bucket"`
	RootPrefix    string   `json:"root_prefix"`
	Enabled       bool     `json:"enabled"`
	IndexDocument string   `json:"index_document"`
	ErrorDocument string   `json:"error_document"`
	SPAFallback   bool     `json:"spa_fallback"`
	Domains       []string `json:"domains"`
}

type siteListResponse struct {
	Items []siteResponse `json:"items"`
}

type uploadBatchResponse struct {
	UploadedCount int              `json:"uploaded_count"`
	Items         []objectResponse `json:"items"`
}

func TestProtectedRoutesRequireAuth(t *testing.T) {
	router := newTestRouter(t, 1024)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestProtectedHealthzRequiresAuthAndReturnsHealthState(t *testing.T) {
	router := newTestRouter(t, 1024)

	unauthorizedReq := httptest.NewRequest(http.MethodGet, "/api/v1/healthz", nil)
	unauthorizedRec := httptest.NewRecorder()
	router.ServeHTTP(unauthorizedRec, unauthorizedReq)
	if unauthorizedRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", unauthorizedRec.Code)
	}

	authorizedReq := httptest.NewRequest(http.MethodGet, "/api/v1/healthz", nil)
	authorizedReq.Header.Set("Authorization", "Bearer dev-token")
	authorizedRec := httptest.NewRecorder()
	router.ServeHTTP(authorizedRec, authorizedReq)
	if authorizedRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", authorizedRec.Code, authorizedRec.Body.String())
	}

	var body apiEnvelope[map[string]any]
	decodeJSON(t, authorizedRec.Body.Bytes(), &body)

	status, ok := body.Data["status"].(map[string]any)
	if !ok {
		t.Fatalf("expected status object, got %+v", body.Data["status"])
	}
	if status["service"] != "ok" {
		t.Fatalf("expected service ok, got %+v", status["service"])
	}
	if status["db"] != "ok" {
		t.Fatalf("expected db ok, got %+v", status["db"])
	}
}

func TestUploadAndDownloadPublicObject(t *testing.T) {
	router := newTestRouter(t, 1024)

	createBucket(t, router, "public-bucket")

	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/public-bucket/objects/docs/readme.txt", strings.NewReader("hello world"))
	req.Header.Set("Authorization", "Bearer dev-token")
	req.Header.Set("X-Object-Visibility", "public")
	req.Header.Set("X-Original-Filename", "readme.txt")
	req.Header.Set("Content-Type", "text/plain")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d, body=%s", rec.Code, rec.Body.String())
	}

	var uploadBody apiEnvelope[objectResponse]
	decodeJSON(t, rec.Body.Bytes(), &uploadBody)
	if uploadBody.Data.OriginalFilename != "readme.txt" {
		t.Fatalf("unexpected original filename %q", uploadBody.Data.OriginalFilename)
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/public-bucket/objects/docs/readme.txt", nil)
	getRec := httptest.NewRecorder()
	router.ServeHTTP(getRec, getReq)

	if getRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", getRec.Code)
	}
	if body := getRec.Body.String(); body != "hello world" {
		t.Fatalf("unexpected body %q", body)
	}
	if got := getRec.Header().Get("ETag"); got == "" {
		t.Fatalf("expected etag header")
	}

	headReq := httptest.NewRequest(http.MethodHead, "/api/v1/buckets/public-bucket/objects/docs/readme.txt", nil)
	headRec := httptest.NewRecorder()
	router.ServeHTTP(headRec, headReq)
	if headRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", headRec.Code)
	}
}

func TestPrivateObjectRequiresAuthOrSignature(t *testing.T) {
	router := newTestRouter(t, 1024)

	createBucket(t, router, "private-bucket")
	uploadObject(t, router, "/api/v1/buckets/private-bucket/objects/secrets/report.txt", "very secret", "private")

	anonymousReq := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/private-bucket/objects/secrets/report.txt", nil)
	anonymousRec := httptest.NewRecorder()
	router.ServeHTTP(anonymousRec, anonymousReq)
	if anonymousRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", anonymousRec.Code)
	}

	authReq := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/private-bucket/objects/secrets/report.txt", nil)
	authReq.Header.Set("Authorization", "Bearer dev-token")
	authRec := httptest.NewRecorder()
	router.ServeHTTP(authRec, authReq)
	if authRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", authRec.Code)
	}

	signReq := httptest.NewRequest(http.MethodPost, "/api/v1/sign/download", bytes.NewBufferString(`{"bucket":"private-bucket","object_key":"secrets/report.txt","expires_in_seconds":300}`))
	signReq.Header.Set("Authorization", "Bearer dev-token")
	signReq.Header.Set("Content-Type", "application/json")
	signRec := httptest.NewRecorder()
	router.ServeHTTP(signRec, signReq)
	if signRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", signRec.Code, signRec.Body.String())
	}

	var signBody apiEnvelope[signResponse]
	decodeJSON(t, signRec.Body.Bytes(), &signBody)
	parsed, err := url.Parse(signBody.Data.URL)
	if err != nil {
		t.Fatalf("parse signed url: %v", err)
	}

	signedReq := httptest.NewRequest(http.MethodGet, parsed.RequestURI(), nil)
	signedRec := httptest.NewRecorder()
	router.ServeHTTP(signedRec, signedReq)
	if signedRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", signedRec.Code, signedRec.Body.String())
	}

	query := parsed.Query()
	query.Set("signature", "broken")
	parsed.RawQuery = query.Encode()
	tamperedReq := httptest.NewRequest(http.MethodGet, parsed.RequestURI(), nil)
	tamperedRec := httptest.NewRecorder()
	router.ServeHTTP(tamperedRec, tamperedReq)
	if tamperedRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", tamperedRec.Code)
	}
}

func TestListObjectsPaginationAndPrefix(t *testing.T) {
	router := newTestRouter(t, 1024)

	createBucket(t, router, "list-bucket")
	uploadObject(t, router, "/api/v1/buckets/list-bucket/objects/docs/a.txt", "A", "public")
	time.Sleep(2 * time.Millisecond)
	uploadObject(t, router, "/api/v1/buckets/list-bucket/objects/docs/b.txt", "B", "public")
	time.Sleep(2 * time.Millisecond)
	uploadObject(t, router, "/api/v1/buckets/list-bucket/objects/images/c.txt", "C", "public")

	firstReq := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/list-bucket/objects?prefix=docs/&limit=1", nil)
	firstReq.Header.Set("Authorization", "Bearer dev-token")
	firstRec := httptest.NewRecorder()
	router.ServeHTTP(firstRec, firstReq)
	if firstRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", firstRec.Code)
	}

	var firstBody apiEnvelope[objectListResponse]
	decodeJSON(t, firstRec.Body.Bytes(), &firstBody)
	if len(firstBody.Data.Items) != 1 || firstBody.Data.Items[0].ObjectKey != "docs/b.txt" {
		t.Fatalf("unexpected first page: %+v", firstBody.Data.Items)
	}
	if firstBody.Data.NextCursor == "" {
		t.Fatalf("expected next_cursor")
	}

	secondReq := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/list-bucket/objects?prefix=docs/&limit=1&cursor="+url.QueryEscape(firstBody.Data.NextCursor), nil)
	secondReq.Header.Set("Authorization", "Bearer dev-token")
	secondRec := httptest.NewRecorder()
	router.ServeHTTP(secondRec, secondReq)
	if secondRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", secondRec.Code)
	}

	var secondBody apiEnvelope[objectListResponse]
	decodeJSON(t, secondRec.Body.Bytes(), &secondBody)
	if len(secondBody.Data.Items) != 1 || secondBody.Data.Items[0].ObjectKey != "docs/a.txt" {
		t.Fatalf("unexpected second page: %+v", secondBody.Data.Items)
	}
}

func TestUploadDecodesEncodedOriginalFilenameHeader(t *testing.T) {
	router := newTestRouter(t, 1024)

	createBucket(t, router, "encoded-bucket")

	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/encoded-bucket/objects/docs/report.txt", strings.NewReader("hello"))
	req.Header.Set("Authorization", "Bearer dev-token")
	req.Header.Set("X-Object-Visibility", "public")
	req.Header.Set("X-Original-Filename", url.PathEscape("中文报告.txt"))
	req.Header.Set("Content-Type", "text/plain")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d, body=%s", rec.Code, rec.Body.String())
	}

	var uploadBody apiEnvelope[objectResponse]
	decodeJSON(t, rec.Body.Bytes(), &uploadBody)
	if uploadBody.Data.OriginalFilename != "中文报告.txt" {
		t.Fatalf("unexpected original filename %q", uploadBody.Data.OriginalFilename)
	}
}

func TestUploadObjectBatchSuccess(t *testing.T) {
	router := newTestRouter(t, 8*1024)

	createBucket(t, router, "batch-bucket")

	req := newMultipartBatchUploadRequest(
		t,
		"/api/v1/buckets/batch-bucket/objects/batch",
		map[string]string{
			"prefix":     "docs/",
			"visibility": "public",
			"manifest": mustMarshalJSON(t, []map[string]string{
				{"file_field": "file_0", "relative_path": "assets/readme.txt"},
				{"file_field": "file_1", "relative_path": "assets/images/logo.png"},
			}),
		},
		map[string]multipartUploadFile{
			"file_0": {Filename: "readme.txt", Content: "hello world", ContentType: "text/plain"},
			"file_1": {Filename: "logo.png", Content: "png-bytes", ContentType: "image/png"},
		},
	)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d, body=%s", rec.Code, rec.Body.String())
	}

	var body apiEnvelope[uploadBatchResponse]
	decodeJSON(t, rec.Body.Bytes(), &body)
	if body.Data.UploadedCount != 2 {
		t.Fatalf("expected uploaded_count 2, got %d", body.Data.UploadedCount)
	}
	if len(body.Data.Items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(body.Data.Items))
	}
	if body.Data.Items[0].ObjectKey != "docs/assets/readme.txt" {
		t.Fatalf("unexpected first object key %q", body.Data.Items[0].ObjectKey)
	}
	if body.Data.Items[1].ObjectKey != "docs/assets/images/logo.png" {
		t.Fatalf("unexpected second object key %q", body.Data.Items[1].ObjectKey)
	}
	if body.Data.Items[0].Visibility != "public" || body.Data.Items[1].Visibility != "public" {
		t.Fatalf("expected public visibility, got %+v", body.Data.Items)
	}
}

func TestUploadObjectBatchSupportsMoreThanThousandFiles(t *testing.T) {
	router := newTestRouter(t, 2*1024*1024)

	createBucket(t, router, "batch-many-files-bucket")

	manifest := make([]map[string]string, 0, 1001)
	files := make(map[string]multipartUploadFile, 1001)
	for i := 0; i < 1001; i++ {
		fieldName := fmt.Sprintf("file_%d", i)
		filename := fmt.Sprintf("asset-%d.txt", i)
		manifest = append(manifest, map[string]string{
			"file_field":    fieldName,
			"relative_path": "assets/" + filename,
		})
		files[fieldName] = multipartUploadFile{
			Filename: filename,
			Content:  "x",
		}
	}

	req := newMultipartBatchUploadRequest(
		t,
		"/api/v1/buckets/batch-many-files-bucket/objects/batch",
		map[string]string{
			"manifest": mustMarshalJSON(t, manifest),
		},
		files,
	)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d, body=%s", rec.Code, rec.Body.String())
	}

	var body apiEnvelope[uploadBatchResponse]
	decodeJSON(t, rec.Body.Bytes(), &body)
	if body.Data.UploadedCount != 1001 {
		t.Fatalf("expected 1001 uploaded files, got %d", body.Data.UploadedCount)
	}
}

func TestUploadObjectBatchValidationErrors(t *testing.T) {
	router := newTestRouter(t, 8*1024)

	createBucket(t, router, "batch-validation-bucket")

	t.Run("invalid manifest json", func(t *testing.T) {
		req := newMultipartBatchUploadRequest(
			t,
			"/api/v1/buckets/batch-validation-bucket/objects/batch",
			map[string]string{
				"prefix":   "docs/",
				"manifest": "{",
			},
			map[string]multipartUploadFile{
				"file_0": {Filename: "readme.txt", Content: "hello"},
			},
		)

		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d, body=%s", rec.Code, rec.Body.String())
		}

		var body apiEnvelope[uploadBatchResponse]
		decodeJSON(t, rec.Body.Bytes(), &body)
		if body.Error == nil || body.Error.Code != "invalid_batch_manifest" {
			t.Fatalf("expected invalid_batch_manifest, got %+v", body.Error)
		}
	})

	t.Run("missing file part", func(t *testing.T) {
		req := newMultipartBatchUploadRequest(
			t,
			"/api/v1/buckets/batch-validation-bucket/objects/batch",
			map[string]string{
				"manifest": mustMarshalJSON(t, []map[string]string{
					{"file_field": "missing", "relative_path": "assets/readme.txt"},
				}),
			},
			nil,
		)

		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d, body=%s", rec.Code, rec.Body.String())
		}

		var body apiEnvelope[uploadBatchResponse]
		decodeJSON(t, rec.Body.Bytes(), &body)
		if body.Error == nil || body.Error.Code != "batch_file_missing" {
			t.Fatalf("expected batch_file_missing, got %+v", body.Error)
		}
	})
}

func TestUploadObjectBatchRejectsInvalidFinalObjectKeyFromPrefix(t *testing.T) {
	router, storageRoot := newTestRouterWithStorageRoot(t, 8*1024)

	createBucket(t, router, "batch-prefix-bucket")

	req := newMultipartBatchUploadRequest(
		t,
		"/api/v1/buckets/batch-prefix-bucket/objects/batch",
		map[string]string{
			"prefix": "/",
			"manifest": mustMarshalJSON(t, []map[string]string{
				{"file_field": "file_0", "relative_path": "assets/readme.txt"},
			}),
		},
		map[string]multipartUploadFile{
			"file_0": {Filename: "readme.txt", Content: "hello world"},
		},
	)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d, body=%s", rec.Code, rec.Body.String())
	}

	var body apiEnvelope[uploadBatchResponse]
	decodeJSON(t, rec.Body.Bytes(), &body)
	if body.Error == nil || body.Error.Code != "invalid_batch_manifest" {
		t.Fatalf("expected invalid_batch_manifest, got %+v", body.Error)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/batch-prefix-bucket/objects", nil)
	listReq.Header.Set("Authorization", "Bearer dev-token")
	listRec := httptest.NewRecorder()
	router.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", listRec.Code, listRec.Body.String())
	}

	var listBody apiEnvelope[objectListResponse]
	decodeJSON(t, listRec.Body.Bytes(), &listBody)
	if len(listBody.Data.Items) != 0 {
		t.Fatalf("expected no persisted objects after invalid final key, got %+v", listBody.Data.Items)
	}

	if files := countFilesUnderRoot(t, storageRoot); files != 0 {
		t.Fatalf("expected no stored files after invalid final key, got %d", files)
	}
}

func TestUploadObjectBatchRejectsOverlongFinalObjectKey(t *testing.T) {
	router, storageRoot := newTestRouterWithStorageRoot(t, 8*1024)

	createBucket(t, router, "batch-long-key-bucket")

	prefix := strings.Repeat("a", 508) + "/"
	req := newMultipartBatchUploadRequest(
		t,
		"/api/v1/buckets/batch-long-key-bucket/objects/batch",
		map[string]string{
			"prefix": prefix,
			"manifest": mustMarshalJSON(t, []map[string]string{
				{"file_field": "file_0", "relative_path": "b.txt"},
			}),
		},
		map[string]multipartUploadFile{
			"file_0": {Filename: "b.txt", Content: "hello world"},
		},
	)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d, body=%s", rec.Code, rec.Body.String())
	}

	var body apiEnvelope[uploadBatchResponse]
	decodeJSON(t, rec.Body.Bytes(), &body)
	if body.Error == nil || body.Error.Code != "invalid_batch_manifest" {
		t.Fatalf("expected invalid_batch_manifest, got %+v", body.Error)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/batch-long-key-bucket/objects", nil)
	listReq.Header.Set("Authorization", "Bearer dev-token")
	listRec := httptest.NewRecorder()
	router.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", listRec.Code, listRec.Body.String())
	}

	var listBody apiEnvelope[objectListResponse]
	decodeJSON(t, listRec.Body.Bytes(), &listBody)
	if len(listBody.Data.Items) != 0 {
		t.Fatalf("expected no persisted objects after overlong final key, got %+v", listBody.Data.Items)
	}

	if files := countFilesUnderRoot(t, storageRoot); files != 0 {
		t.Fatalf("expected no stored files after overlong final key, got %d", files)
	}
}

func TestUploadObjectBatchRollsBackAndCleansStorage(t *testing.T) {
	router, storageRoot := newTestRouterWithStorageRoot(t, 8*1024)

	createBucket(t, router, "batch-rollback-bucket")

	req := newMultipartBatchUploadRequest(
		t,
		"/api/v1/buckets/batch-rollback-bucket/objects/batch",
		map[string]string{
			"manifest": mustMarshalJSON(t, []map[string]string{
				{"file_field": "file_0", "relative_path": "assets/readme.txt"},
				{"file_field": "file_1", "relative_path": "/invalid.txt"},
			}),
		},
		map[string]multipartUploadFile{
			"file_0": {Filename: "readme.txt", Content: "hello world"},
			"file_1": {Filename: "invalid.txt", Content: "bad"},
		},
	)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d, body=%s", rec.Code, rec.Body.String())
	}

	var body apiEnvelope[uploadBatchResponse]
	decodeJSON(t, rec.Body.Bytes(), &body)
	if body.Error == nil || body.Error.Code != "invalid_batch_manifest" {
		t.Fatalf("expected invalid_batch_manifest, got %+v", body.Error)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/batch-rollback-bucket/objects", nil)
	listReq.Header.Set("Authorization", "Bearer dev-token")
	listRec := httptest.NewRecorder()
	router.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", listRec.Code, listRec.Body.String())
	}

	var listBody apiEnvelope[objectListResponse]
	decodeJSON(t, listRec.Body.Bytes(), &listBody)
	if len(listBody.Data.Items) != 0 {
		t.Fatalf("expected no persisted objects after rollback, got %+v", listBody.Data.Items)
	}

	if files := countFilesUnderRoot(t, storageRoot); files != 0 {
		t.Fatalf("expected no stored files after rollback, got %d", files)
	}
}

func TestUploadObjectBatchBucketNotFound(t *testing.T) {
	router := newTestRouter(t, 8*1024)

	req := newMultipartBatchUploadRequest(
		t,
		"/api/v1/buckets/missing-bucket/objects/batch",
		map[string]string{
			"manifest": mustMarshalJSON(t, []map[string]string{
				{"file_field": "file_0", "relative_path": "assets/readme.txt"},
			}),
		},
		map[string]multipartUploadFile{
			"file_0": {Filename: "readme.txt", Content: "hello"},
		},
	)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d, body=%s", rec.Code, rec.Body.String())
	}
}

func TestUploadObjectBatchSizeLimit(t *testing.T) {
	router := newTestRouter(t, 64)

	createBucket(t, router, "batch-limit-bucket")

	req := newMultipartBatchUploadRequest(
		t,
		"/api/v1/buckets/batch-limit-bucket/objects/batch",
		map[string]string{
			"manifest": mustMarshalJSON(t, []map[string]string{
				{"file_field": "file_0", "relative_path": "assets/big.txt"},
			}),
		},
		map[string]multipartUploadFile{
			"file_0": {Filename: "big.txt", Content: strings.Repeat("a", 256)},
		},
	)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413, got %d, body=%s", rec.Code, rec.Body.String())
	}
}

func TestListFoldersAndExplorerEntries(t *testing.T) {
	router := newTestRouter(t, 1024)

	createBucket(t, router, "tree-bucket")
	uploadObject(t, router, "/api/v1/buckets/tree-bucket/objects/docs/alpha.txt", "A", "public")
	uploadObject(t, router, "/api/v1/buckets/tree-bucket/objects/docs/zeta.txt", "Z", "public")
	uploadObject(t, router, "/api/v1/buckets/tree-bucket/objects/docs/images/c.txt", "C", "public")
	createFolder(t, router, "tree-bucket", "docs/", "empty")

	foldersReq := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/tree-bucket/folders", nil)
	foldersReq.Header.Set("Authorization", "Bearer dev-token")
	foldersRec := httptest.NewRecorder()
	router.ServeHTTP(foldersRec, foldersReq)
	if foldersRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", foldersRec.Code, foldersRec.Body.String())
	}

	var foldersBody apiEnvelope[folderListResponse]
	decodeJSON(t, foldersRec.Body.Bytes(), &foldersBody)
	if len(foldersBody.Data.Items) != 3 {
		t.Fatalf("unexpected folder count: %+v", foldersBody.Data.Items)
	}
	if foldersBody.Data.Items[0].Path != "docs/" || foldersBody.Data.Items[1].Path != "docs/empty/" || foldersBody.Data.Items[2].Path != "docs/images/" {
		t.Fatalf("unexpected folders: %+v", foldersBody.Data.Items)
	}

	firstEntriesReq := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/tree-bucket/entries?prefix=docs/&limit=2", nil)
	firstEntriesReq.Header.Set("Authorization", "Bearer dev-token")
	firstEntriesRec := httptest.NewRecorder()
	router.ServeHTTP(firstEntriesRec, firstEntriesReq)
	if firstEntriesRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", firstEntriesRec.Code, firstEntriesRec.Body.String())
	}

	var firstEntriesBody apiEnvelope[explorerListResponse]
	decodeJSON(t, firstEntriesRec.Body.Bytes(), &firstEntriesBody)
	if len(firstEntriesBody.Data.Items) != 2 {
		t.Fatalf("unexpected first entries page: %+v", firstEntriesBody.Data.Items)
	}
	if firstEntriesBody.Data.Items[0].Type != "directory" || firstEntriesBody.Data.Items[0].Name != "empty" {
		t.Fatalf("unexpected first directory entry: %+v", firstEntriesBody.Data.Items[0])
	}
	if firstEntriesBody.Data.Items[0].IsEmpty == nil || !*firstEntriesBody.Data.Items[0].IsEmpty {
		t.Fatalf("expected empty directory flag on %+v", firstEntriesBody.Data.Items[0])
	}
	if firstEntriesBody.Data.Items[1].Type != "directory" || firstEntriesBody.Data.Items[1].Name != "images" {
		t.Fatalf("unexpected second directory entry: %+v", firstEntriesBody.Data.Items[1])
	}
	if firstEntriesBody.Data.NextCursor == "" {
		t.Fatalf("expected next cursor for first entries page")
	}

	secondEntriesReq := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/buckets/tree-bucket/entries?prefix=docs/&limit=2&cursor="+url.QueryEscape(firstEntriesBody.Data.NextCursor),
		nil,
	)
	secondEntriesReq.Header.Set("Authorization", "Bearer dev-token")
	secondEntriesRec := httptest.NewRecorder()
	router.ServeHTTP(secondEntriesRec, secondEntriesReq)
	if secondEntriesRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", secondEntriesRec.Code, secondEntriesRec.Body.String())
	}

	var secondEntriesBody apiEnvelope[explorerListResponse]
	decodeJSON(t, secondEntriesRec.Body.Bytes(), &secondEntriesBody)
	if len(secondEntriesBody.Data.Items) != 2 {
		t.Fatalf("unexpected second entries page: %+v", secondEntriesBody.Data.Items)
	}
	if secondEntriesBody.Data.Items[0].Type != "file" || secondEntriesBody.Data.Items[0].Name != "alpha.txt" {
		t.Fatalf("unexpected file entry: %+v", secondEntriesBody.Data.Items[0])
	}
	if secondEntriesBody.Data.Items[1].Type != "file" || secondEntriesBody.Data.Items[1].Name != "zeta.txt" {
		t.Fatalf("unexpected file entry: %+v", secondEntriesBody.Data.Items[1])
	}

	searchReq := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/tree-bucket/entries?prefix=docs/&search=alp", nil)
	searchReq.Header.Set("Authorization", "Bearer dev-token")
	searchRec := httptest.NewRecorder()
	router.ServeHTTP(searchRec, searchReq)
	if searchRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", searchRec.Code, searchRec.Body.String())
	}

	var searchBody apiEnvelope[explorerListResponse]
	decodeJSON(t, searchRec.Body.Bytes(), &searchBody)
	if len(searchBody.Data.Items) != 1 || searchBody.Data.Items[0].Name != "alpha.txt" {
		t.Fatalf("unexpected search results: %+v", searchBody.Data.Items)
	}
}

func TestCreateAndDeleteFolder(t *testing.T) {
	router := newTestRouter(t, 1024)

	createBucket(t, router, "folder-bucket")
	createFolder(t, router, "folder-bucket", "", "empty")

	duplicateReq := httptest.NewRequest(http.MethodPost, "/api/v1/buckets/folder-bucket/folders", bytes.NewBufferString(`{"prefix":"","name":"empty"}`))
	duplicateReq.Header.Set("Authorization", "Bearer dev-token")
	duplicateReq.Header.Set("Content-Type", "application/json")
	duplicateRec := httptest.NewRecorder()
	router.ServeHTTP(duplicateRec, duplicateReq)
	if duplicateRec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d, body=%s", duplicateRec.Code, duplicateRec.Body.String())
	}

	deleteEmptyReq := httptest.NewRequest(http.MethodDelete, "/api/v1/buckets/folder-bucket/folders?path="+url.QueryEscape("empty/"), nil)
	deleteEmptyReq.Header.Set("Authorization", "Bearer dev-token")
	deleteEmptyRec := httptest.NewRecorder()
	router.ServeHTTP(deleteEmptyRec, deleteEmptyReq)
	if deleteEmptyRec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d, body=%s", deleteEmptyRec.Code, deleteEmptyRec.Body.String())
	}

	uploadObject(t, router, "/api/v1/buckets/folder-bucket/objects/docs/readme.txt", "hello", "public")
	uploadObject(t, router, "/api/v1/buckets/folder-bucket/objects/docs/nested/guide.txt", "nested", "private")

	deleteNonEmptyReq := httptest.NewRequest(http.MethodDelete, "/api/v1/buckets/folder-bucket/folders?path="+url.QueryEscape("docs/"), nil)
	deleteNonEmptyReq.Header.Set("Authorization", "Bearer dev-token")
	deleteNonEmptyRec := httptest.NewRecorder()
	router.ServeHTTP(deleteNonEmptyRec, deleteNonEmptyReq)
	if deleteNonEmptyRec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d, body=%s", deleteNonEmptyRec.Code, deleteNonEmptyRec.Body.String())
	}

	deleteRecursiveReq := httptest.NewRequest(
		http.MethodDelete,
		"/api/v1/buckets/folder-bucket/folders?path="+url.QueryEscape("docs/")+"&recursive=true",
		nil,
	)
	deleteRecursiveReq.Header.Set("Authorization", "Bearer dev-token")
	deleteRecursiveRec := httptest.NewRecorder()
	router.ServeHTTP(deleteRecursiveRec, deleteRecursiveReq)
	if deleteRecursiveRec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d, body=%s", deleteRecursiveRec.Code, deleteRecursiveRec.Body.String())
	}

	listEntriesReq := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/folder-bucket/entries", nil)
	listEntriesReq.Header.Set("Authorization", "Bearer dev-token")
	listEntriesRec := httptest.NewRecorder()
	router.ServeHTTP(listEntriesRec, listEntriesReq)
	if listEntriesRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", listEntriesRec.Code, listEntriesRec.Body.String())
	}

	var listEntriesBody apiEnvelope[explorerListResponse]
	decodeJSON(t, listEntriesRec.Body.Bytes(), &listEntriesBody)
	if len(listEntriesBody.Data.Items) != 0 {
		t.Fatalf("expected empty root after recursive delete, got %+v", listEntriesBody.Data.Items)
	}

	deleteMissingReq := httptest.NewRequest(
		http.MethodDelete,
		"/api/v1/buckets/folder-bucket/folders?path="+url.QueryEscape("missing/")+"&recursive=true",
		nil,
	)
	deleteMissingReq.Header.Set("Authorization", "Bearer dev-token")
	deleteMissingRec := httptest.NewRecorder()
	router.ServeHTTP(deleteMissingRec, deleteMissingReq)
	if deleteMissingRec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d, body=%s", deleteMissingRec.Code, deleteMissingRec.Body.String())
	}
}

func TestRecursiveDeleteEscapesLikeWildcards(t *testing.T) {
	router := newTestRouter(t, 1024)

	createBucket(t, router, "wildcard-bucket")
	uploadObject(t, router, "/api/v1/buckets/wildcard-bucket/objects/a_/keep.txt", "keep", "public")
	uploadObject(t, router, "/api/v1/buckets/wildcard-bucket/objects/ab/stay.txt", "stay", "public")
	uploadObject(t, router, "/api/v1/buckets/wildcard-bucket/objects/ghosts/readme.txt", "ghost", "public")

	deleteUnderscoreReq := httptest.NewRequest(
		http.MethodDelete,
		"/api/v1/buckets/wildcard-bucket/folders?path="+url.QueryEscape("a_/")+"&recursive=true",
		nil,
	)
	deleteUnderscoreReq.Header.Set("Authorization", "Bearer dev-token")
	deleteUnderscoreRec := httptest.NewRecorder()
	router.ServeHTTP(deleteUnderscoreRec, deleteUnderscoreReq)
	if deleteUnderscoreRec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d, body=%s", deleteUnderscoreRec.Code, deleteUnderscoreRec.Body.String())
	}

	rootEntriesReq := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/wildcard-bucket/entries", nil)
	rootEntriesReq.Header.Set("Authorization", "Bearer dev-token")
	rootEntriesRec := httptest.NewRecorder()
	router.ServeHTTP(rootEntriesRec, rootEntriesReq)
	if rootEntriesRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", rootEntriesRec.Code, rootEntriesRec.Body.String())
	}

	var rootEntriesBody apiEnvelope[explorerListResponse]
	decodeJSON(t, rootEntriesRec.Body.Bytes(), &rootEntriesBody)
	if len(rootEntriesBody.Data.Items) != 2 {
		t.Fatalf("expected 2 remaining root directories, got %+v", rootEntriesBody.Data.Items)
	}
	if rootEntriesBody.Data.Items[0].Path != "ab/" || rootEntriesBody.Data.Items[1].Path != "ghosts/" {
		t.Fatalf("unexpected remaining directories after underscore delete: %+v", rootEntriesBody.Data.Items)
	}

	deleteMissingWildcardReq := httptest.NewRequest(
		http.MethodDelete,
		"/api/v1/buckets/wildcard-bucket/folders?path="+url.QueryEscape("ghost%/")+"&recursive=true",
		nil,
	)
	deleteMissingWildcardReq.Header.Set("Authorization", "Bearer dev-token")
	deleteMissingWildcardRec := httptest.NewRecorder()
	router.ServeHTTP(deleteMissingWildcardRec, deleteMissingWildcardReq)
	if deleteMissingWildcardRec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d, body=%s", deleteMissingWildcardRec.Code, deleteMissingWildcardRec.Body.String())
	}

	ghostEntriesReq := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/wildcard-bucket/entries?prefix="+url.QueryEscape("ghosts/"), nil)
	ghostEntriesReq.Header.Set("Authorization", "Bearer dev-token")
	ghostEntriesRec := httptest.NewRecorder()
	router.ServeHTTP(ghostEntriesRec, ghostEntriesReq)
	if ghostEntriesRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", ghostEntriesRec.Code, ghostEntriesRec.Body.String())
	}

	var ghostEntriesBody apiEnvelope[explorerListResponse]
	decodeJSON(t, ghostEntriesRec.Body.Bytes(), &ghostEntriesBody)
	if len(ghostEntriesBody.Data.Items) != 1 || ghostEntriesBody.Data.Items[0].Path != "ghosts/readme.txt" {
		t.Fatalf("expected ghosts/readme.txt to remain after missing wildcard delete, got %+v", ghostEntriesBody.Data.Items)
	}
}

func TestUploadRejectsReservedFolderMarkerName(t *testing.T) {
	router := newTestRouter(t, 1024)

	createBucket(t, router, "reserved-bucket")

	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/reserved-bucket/objects/docs/.light-oss-folder", strings.NewReader("bad"))
	req.Header.Set("Authorization", "Bearer dev-token")
	req.Header.Set("X-Object-Visibility", "private")
	req.Header.Set("X-Original-Filename", ".light-oss-folder")
	req.Header.Set("Content-Type", "text/plain")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d, body=%s", rec.Code, rec.Body.String())
	}
}

func TestUploadSizeLimit(t *testing.T) {
	router := newTestRouter(t, 4)

	createBucket(t, router, "limit-bucket")

	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/limit-bucket/objects/docs/oversized.txt", strings.NewReader("12345"))
	req.Header.Set("Authorization", "Bearer dev-token")
	req.Header.Set("X-Object-Visibility", "public")
	req.Header.Set("X-Original-Filename", "oversized.txt")
	req.Header.Set("Content-Type", "text/plain")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413, got %d, body=%s", rec.Code, rec.Body.String())
	}
}

func TestUpdateObjectVisibility(t *testing.T) {
	router := newTestRouter(t, 1024)

	createBucket(t, router, "visibility-bucket")
	uploadObject(t, router, "/api/v1/buckets/visibility-bucket/objects/docs/readme.txt", "hello", "private")

	unauthorizedReq := httptest.NewRequest(
		http.MethodPatch,
		"/api/v1/buckets/visibility-bucket/objects/visibility/docs/readme.txt",
		bytes.NewBufferString(`{"visibility":"public"}`),
	)
	unauthorizedReq.Header.Set("Content-Type", "application/json")
	unauthorizedRec := httptest.NewRecorder()
	router.ServeHTTP(unauthorizedRec, unauthorizedReq)
	if unauthorizedRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", unauthorizedRec.Code)
	}

	invalidReq := httptest.NewRequest(
		http.MethodPatch,
		"/api/v1/buckets/visibility-bucket/objects/visibility/docs/readme.txt",
		bytes.NewBufferString(`{"visibility":"internal"}`),
	)
	invalidReq.Header.Set("Authorization", "Bearer dev-token")
	invalidReq.Header.Set("Content-Type", "application/json")
	invalidRec := httptest.NewRecorder()
	router.ServeHTTP(invalidRec, invalidReq)
	if invalidRec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d, body=%s", invalidRec.Code, invalidRec.Body.String())
	}
	var invalidBody apiEnvelope[objectResponse]
	decodeJSON(t, invalidRec.Body.Bytes(), &invalidBody)
	if invalidBody.Error == nil || invalidBody.Error.Code != "invalid_visibility" {
		t.Fatalf("expected invalid_visibility error, got %+v", invalidBody.Error)
	}

	notFoundReq := httptest.NewRequest(
		http.MethodPatch,
		"/api/v1/buckets/visibility-bucket/objects/visibility/docs/missing.txt",
		bytes.NewBufferString(`{"visibility":"public"}`),
	)
	notFoundReq.Header.Set("Authorization", "Bearer dev-token")
	notFoundReq.Header.Set("Content-Type", "application/json")
	notFoundRec := httptest.NewRecorder()
	router.ServeHTTP(notFoundRec, notFoundReq)
	if notFoundRec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d, body=%s", notFoundRec.Code, notFoundRec.Body.String())
	}

	updatePublicReq := httptest.NewRequest(
		http.MethodPatch,
		"/api/v1/buckets/visibility-bucket/objects/visibility/docs/readme.txt",
		bytes.NewBufferString(`{"visibility":"public"}`),
	)
	updatePublicReq.Header.Set("Authorization", "Bearer dev-token")
	updatePublicReq.Header.Set("Content-Type", "application/json")
	updatePublicRec := httptest.NewRecorder()
	router.ServeHTTP(updatePublicRec, updatePublicReq)
	if updatePublicRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", updatePublicRec.Code, updatePublicRec.Body.String())
	}
	var updatePublicBody apiEnvelope[objectResponse]
	decodeJSON(t, updatePublicRec.Body.Bytes(), &updatePublicBody)
	if updatePublicBody.Data.Visibility != "public" {
		t.Fatalf("expected visibility public, got %q", updatePublicBody.Data.Visibility)
	}

	updatePrivateReq := httptest.NewRequest(
		http.MethodPatch,
		"/api/v1/buckets/visibility-bucket/objects/visibility/docs/readme.txt",
		bytes.NewBufferString(`{"visibility":"private"}`),
	)
	updatePrivateReq.Header.Set("Authorization", "Bearer dev-token")
	updatePrivateReq.Header.Set("Content-Type", "application/json")
	updatePrivateRec := httptest.NewRecorder()
	router.ServeHTTP(updatePrivateRec, updatePrivateReq)
	if updatePrivateRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", updatePrivateRec.Code, updatePrivateRec.Body.String())
	}
	var updatePrivateBody apiEnvelope[objectResponse]
	decodeJSON(t, updatePrivateRec.Body.Bytes(), &updatePrivateBody)
	if updatePrivateBody.Data.Visibility != "private" {
		t.Fatalf("expected visibility private, got %q", updatePrivateBody.Data.Visibility)
	}
}

func TestSiteManagementCRUDAndDomainConflict(t *testing.T) {
	router := newTestRouter(t, 1024)

	createBucket(t, router, "websites")
	createBucket(t, router, "other-sites")

	created := createSite(t, router, `{
		"bucket":"websites",
		"root_prefix":"demo",
		"domains":["demo.underhear.cn"],
		"enabled":true
	}`)
	if created.RootPrefix != "demo/" {
		t.Fatalf("expected normalized root prefix, got %q", created.RootPrefix)
	}
	if created.IndexDocument != "index.html" {
		t.Fatalf("expected default index document, got %q", created.IndexDocument)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/sites", nil)
	listReq.Header.Set("Authorization", "Bearer dev-token")
	listRec := httptest.NewRecorder()
	router.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", listRec.Code, listRec.Body.String())
	}
	var listBody apiEnvelope[siteListResponse]
	decodeJSON(t, listRec.Body.Bytes(), &listBody)
	if len(listBody.Data.Items) != 1 {
		t.Fatalf("expected 1 site, got %d", len(listBody.Data.Items))
	}

	getReq := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/sites/%d", created.ID), nil)
	getReq.Header.Set("Authorization", "Bearer dev-token")
	getRec := httptest.NewRecorder()
	router.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", getRec.Code, getRec.Body.String())
	}

	updateReq := httptest.NewRequest(
		http.MethodPut,
		fmt.Sprintf("/api/v1/sites/%d", created.ID),
		bytes.NewBufferString(`{
			"bucket":"websites",
			"root_prefix":"demo/",
			"domains":["demo.underhear.cn","www.underhear.cn"],
			"enabled":false,
			"index_document":"home.html",
			"error_document":"404.html",
			"spa_fallback":true
		}`),
	)
	updateReq.Header.Set("Authorization", "Bearer dev-token")
	updateReq.Header.Set("Content-Type", "application/json")
	updateRec := httptest.NewRecorder()
	router.ServeHTTP(updateRec, updateReq)
	if updateRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", updateRec.Code, updateRec.Body.String())
	}
	var updateBody apiEnvelope[siteResponse]
	decodeJSON(t, updateRec.Body.Bytes(), &updateBody)
	if updateBody.Data.Enabled {
		t.Fatalf("expected site to be disabled after update")
	}
	if len(updateBody.Data.Domains) != 2 {
		t.Fatalf("expected 2 domains, got %d", len(updateBody.Data.Domains))
	}

	conflictReq := httptest.NewRequest(
		http.MethodPost,
		"/api/v1/sites",
		bytes.NewBufferString(`{
			"bucket":"other-sites",
			"root_prefix":"app/",
			"domains":["demo.underhear.cn"]
		}`),
	)
	conflictReq.Header.Set("Authorization", "Bearer dev-token")
	conflictReq.Header.Set("Content-Type", "application/json")
	conflictRec := httptest.NewRecorder()
	router.ServeHTTP(conflictRec, conflictReq)
	if conflictRec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d, body=%s", conflictRec.Code, conflictRec.Body.String())
	}

	deleteReq := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/v1/sites/%d", created.ID), nil)
	deleteReq.Header.Set("Authorization", "Bearer dev-token")
	deleteRec := httptest.NewRecorder()
	router.ServeHTTP(deleteRec, deleteReq)
	if deleteRec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d, body=%s", deleteRec.Code, deleteRec.Body.String())
	}
}

func TestSiteManagementRejectsDeepSubdomains(t *testing.T) {
	router := newTestRouter(t, 1024)

	createBucket(t, router, "websites")

	req := httptest.NewRequest(
		http.MethodPost,
		"/api/v1/sites",
		bytes.NewBufferString(`{
			"bucket":"websites",
			"root_prefix":"demo/",
			"domains":["www.demo.underhear.cn"]
		}`),
	)
	req.Header.Set("Authorization", "Bearer dev-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d, body=%s", rec.Code, rec.Body.String())
	}
}

func TestSitePublicRoutesServeIndexAssetsAndHostMapping(t *testing.T) {
	router := newTestRouter(t, 1024)

	createBucket(t, router, "websites")
	uploadObjectWithContentType(t, router, "/api/v1/buckets/websites/objects/demo/index.html", "<html>home</html>", "public", "text/html")
	uploadObjectWithContentType(t, router, "/api/v1/buckets/websites/objects/demo/assets/app.js", "console.log('demo')", "public", "application/javascript")
	uploadObjectWithContentType(t, router, "/api/v1/buckets/websites/objects/demo/docs/index.html", "<html>docs</html>", "public", "text/html")

	site := createSite(t, router, `{
		"bucket":"websites",
		"root_prefix":"demo/",
		"domains":["demo.underhear.cn"]
	}`)

	indexReq := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/sites/%d", site.ID), nil)
	indexRec := httptest.NewRecorder()
	router.ServeHTTP(indexRec, indexReq)
	if indexRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", indexRec.Code, indexRec.Body.String())
	}
	if body := indexRec.Body.String(); body != "<html>home</html>" {
		t.Fatalf("unexpected index body %q", body)
	}

	headReq := httptest.NewRequest(http.MethodHead, fmt.Sprintf("/sites/%d", site.ID), nil)
	headRec := httptest.NewRecorder()
	router.ServeHTTP(headRec, headReq)
	if headRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", headRec.Code)
	}
	if headRec.Body.Len() != 0 {
		t.Fatalf("expected empty body for HEAD, got %q", headRec.Body.String())
	}

	assetReq := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/sites/%d/assets/app.js", site.ID), nil)
	assetRec := httptest.NewRecorder()
	router.ServeHTTP(assetRec, assetReq)
	if assetRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", assetRec.Code, assetRec.Body.String())
	}
	if got := assetRec.Header().Get("Content-Type"); got != "application/javascript" {
		t.Fatalf("expected application/javascript, got %q", got)
	}

	dirReq := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/sites/%d/docs/", site.ID), nil)
	dirRec := httptest.NewRecorder()
	router.ServeHTTP(dirRec, dirReq)
	if dirRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", dirRec.Code, dirRec.Body.String())
	}
	if body := dirRec.Body.String(); body != "<html>docs</html>" {
		t.Fatalf("unexpected directory body %q", body)
	}

	hostReq := httptest.NewRequest(http.MethodGet, "/assets/app.js", nil)
	hostReq.Host = "demo.underhear.cn"
	hostRec := httptest.NewRecorder()
	router.ServeHTTP(hostRec, hostReq)
	if hostRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", hostRec.Code, hostRec.Body.String())
	}
	if body := hostRec.Body.String(); body != "console.log('demo')" {
		t.Fatalf("unexpected host-routed body %q", body)
	}
}

func TestSitePublicRoutesFallbackAndPrivateProtection(t *testing.T) {
	router := newTestRouter(t, 1024)

	createBucket(t, router, "websites")
	uploadObjectWithContentType(t, router, "/api/v1/buckets/websites/objects/demo/index.html", "<html>app</html>", "public", "text/html")
	uploadObjectWithContentType(t, router, "/api/v1/buckets/websites/objects/demo/404.html", "<html>missing</html>", "public", "text/html")
	uploadObjectWithContentType(t, router, "/api/v1/buckets/websites/objects/demo/secret.txt", "hidden", "private", "text/plain")

	site := createSite(t, router, `{
		"bucket":"websites",
		"root_prefix":"demo/",
		"domains":["demo.underhear.cn"],
		"spa_fallback":true
	}`)

	spaReq := httptest.NewRequest(http.MethodGet, "/dashboard/settings", nil)
	spaReq.Host = "demo.underhear.cn"
	spaRec := httptest.NewRecorder()
	router.ServeHTTP(spaRec, spaReq)
	if spaRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", spaRec.Code, spaRec.Body.String())
	}
	if body := spaRec.Body.String(); body != "<html>app</html>" {
		t.Fatalf("unexpected spa fallback body %q", body)
	}

	privateReq := httptest.NewRequest(http.MethodGet, "/secret.txt", nil)
	privateReq.Host = "demo.underhear.cn"
	privateRec := httptest.NewRecorder()
	router.ServeHTTP(privateRec, privateReq)
	if privateRec.Code != http.StatusOK {
		t.Fatalf("expected spa fallback to mask private object, got %d, body=%s", privateRec.Code, privateRec.Body.String())
	}
	if body := privateRec.Body.String(); body != "<html>app</html>" {
		t.Fatalf("unexpected body for private-object fallback %q", body)
	}

	updateReq := httptest.NewRequest(
		http.MethodPut,
		fmt.Sprintf("/api/v1/sites/%d", site.ID),
		bytes.NewBufferString(`{
			"bucket":"websites",
			"root_prefix":"demo/",
			"domains":["demo.underhear.cn"],
			"spa_fallback":false,
			"error_document":"404.html"
		}`),
	)
	updateReq.Header.Set("Authorization", "Bearer dev-token")
	updateReq.Header.Set("Content-Type", "application/json")
	updateRec := httptest.NewRecorder()
	router.ServeHTTP(updateRec, updateReq)
	if updateRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", updateRec.Code, updateRec.Body.String())
	}

	missingReq := httptest.NewRequest(http.MethodGet, "/missing/page", nil)
	missingReq.Host = "demo.underhear.cn"
	missingRec := httptest.NewRecorder()
	router.ServeHTTP(missingRec, missingReq)
	if missingRec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d, body=%s", missingRec.Code, missingRec.Body.String())
	}
	if body := missingRec.Body.String(); body != "<html>missing</html>" {
		t.Fatalf("unexpected error document body %q", body)
	}

	disabledReq := httptest.NewRequest(
		http.MethodPut,
		fmt.Sprintf("/api/v1/sites/%d", site.ID),
		bytes.NewBufferString(`{
			"bucket":"websites",
			"root_prefix":"demo/",
			"domains":["demo.underhear.cn"],
			"enabled":false
		}`),
	)
	disabledReq.Header.Set("Authorization", "Bearer dev-token")
	disabledReq.Header.Set("Content-Type", "application/json")
	disabledRec := httptest.NewRecorder()
	router.ServeHTTP(disabledRec, disabledReq)
	if disabledRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", disabledRec.Code, disabledRec.Body.String())
	}

	disabledSiteReq := httptest.NewRequest(http.MethodGet, "/anything", nil)
	disabledSiteReq.Host = "demo.underhear.cn"
	disabledSiteRec := httptest.NewRecorder()
	router.ServeHTTP(disabledSiteRec, disabledSiteReq)
	if disabledSiteRec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", disabledSiteRec.Code)
	}
}

func TestSiteNoRouteDoesNotConsumeAPIOrUnknownHosts(t *testing.T) {
	router := newTestRouter(t, 1024)

	createBucket(t, router, "websites")
	createSite(t, router, `{
		"bucket":"websites",
		"root_prefix":"demo/",
		"domains":["demo.underhear.cn"]
	}`)

	apiReq := httptest.NewRequest(http.MethodGet, "/api/v1/unknown", nil)
	apiReq.Host = "demo.underhear.cn"
	apiRec := httptest.NewRecorder()
	router.ServeHTTP(apiRec, apiReq)
	if apiRec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", apiRec.Code)
	}

	hostReq := httptest.NewRequest(http.MethodGet, "/", nil)
	hostReq.Host = "unknown.underhear.cn"
	hostRec := httptest.NewRecorder()
	router.ServeHTTP(hostRec, hostReq)
	if hostRec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", hostRec.Code)
	}
}

func newTestRouter(t *testing.T, maxUploadSize int64) *gin.Engine {
	router, _ := newTestRouterWithStorageRoot(t, maxUploadSize)
	return router
}

func newTestRouterWithStorageRoot(t *testing.T, maxUploadSize int64) (*gin.Engine, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	dsn := fmt.Sprintf("file:%d?mode=memory&cache=shared", time.Now().UnixNano())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}

	if err := db.AutoMigrate(&model.Bucket{}, &model.Object{}, &model.Site{}, &model.SiteDomain{}); err != nil {
		t.Fatalf("migrate sqlite: %v", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("sql db: %v", err)
	}

	root := t.TempDir()
	cfg := config.Config{
		AppEnv:                     "development",
		AppAddr:                    ":0",
		PublicBaseURL:              "http://example.com",
		StorageRoot:                filepath.ToSlash(root),
		MaxUploadSizeBytes:         maxUploadSize,
		MaxMultipartMemoryBytes:    8 * 1024 * 1024,
		RateLimitRPS:               1000,
		RateLimitBurst:             1000,
		CORSAllowedOrigins:         []string{"http://localhost:3000"},
		BearerTokens:               []string{"dev-token"},
		SigningSecret:              "test-secret",
		DefaultSignedURLTTLSeconds: 300,
		MaxSignedURLTTLSeconds:     86400,
	}

	bucketRepo := repository.NewBucketRepository(db)
	objectRepo := repository.NewObjectRepository(db)
	siteRepo := repository.NewSiteRepository(db)
	localStorage := storage.NewLocalStorage(root)
	objectService := service.NewObjectService(bucketRepo, objectRepo, localStorage)
	return handler.NewRouter(handler.Dependencies{
		Config:        cfg,
		Logger:        zap.NewNop(),
		DB:            sqlDB,
		GormDB:        db,
		AuthValidator: middleware.NewTokenValidator(cfg.BearerTokens),
		BucketService: service.NewBucketService(bucketRepo),
		ObjectService: objectService,
		SiteService:   service.NewSiteService(bucketRepo, siteRepo, objectService),
		SignService:   service.NewSignService(signing.NewSigner(cfg.SigningSecret), cfg.PublicBaseURL, cfg.DefaultSignedURLTTLSeconds, cfg.MaxSignedURLTTLSeconds),
	}), root
}

func createBucket(t *testing.T, router *gin.Engine, name string) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/buckets", bytes.NewBufferString(`{"name":"`+name+`"}`))
	req.Header.Set("Authorization", "Bearer dev-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create bucket expected 201, got %d, body=%s", rec.Code, rec.Body.String())
	}
}

func uploadObject(t *testing.T, router *gin.Engine, path string, body string, visibility string) {
	t.Helper()
	uploadObjectWithContentType(t, router, path, body, visibility, "text/plain")
}

func uploadObjectWithContentType(t *testing.T, router *gin.Engine, path string, body string, visibility string, contentType string) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, path, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer dev-token")
	req.Header.Set("X-Object-Visibility", visibility)
	req.Header.Set("X-Original-Filename", "file.txt")
	req.Header.Set("Content-Type", contentType)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("upload expected 201, got %d, body=%s", rec.Code, rec.Body.String())
	}
}

func createSite(t *testing.T, router *gin.Engine, payload string) siteResponse {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/sites", bytes.NewBufferString(payload))
	req.Header.Set("Authorization", "Bearer dev-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create site expected 201, got %d, body=%s", rec.Code, rec.Body.String())
	}

	var body apiEnvelope[siteResponse]
	decodeJSON(t, rec.Body.Bytes(), &body)
	return body.Data
}

func createFolder(t *testing.T, router *gin.Engine, bucket string, prefix string, name string) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/buckets/"+bucket+"/folders", bytes.NewBufferString(`{"prefix":"`+prefix+`","name":"`+name+`"}`))
	req.Header.Set("Authorization", "Bearer dev-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create folder expected 201, got %d, body=%s", rec.Code, rec.Body.String())
	}
}

func decodeJSON(t *testing.T, body []byte, target any) {
	t.Helper()
	if err := json.Unmarshal(body, target); err != nil {
		t.Fatalf("decode json: %v, body=%s", err, string(body))
	}
}

type multipartUploadFile struct {
	Filename    string
	Content     string
	ContentType string
}

func newMultipartBatchUploadRequest(
	t *testing.T,
	targetURL string,
	fields map[string]string,
	files map[string]multipartUploadFile,
) *http.Request {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	for key, value := range fields {
		if err := writer.WriteField(key, value); err != nil {
			t.Fatalf("write field %s: %v", key, err)
		}
	}

	for fieldName, file := range files {
		header := textproto.MIMEHeader{}
		header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, fieldName, file.Filename))
		if file.ContentType != "" {
			header.Set("Content-Type", file.ContentType)
		}

		part, err := writer.CreatePart(header)
		if err != nil {
			t.Fatalf("create file part %s: %v", fieldName, err)
		}
		if _, err := part.Write([]byte(file.Content)); err != nil {
			t.Fatalf("write file part %s: %v", fieldName, err)
		}
	}

	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, targetURL, bytes.NewReader(body.Bytes()))
	req.Header.Set("Authorization", "Bearer dev-token")
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return req
}

func mustMarshalJSON(t *testing.T, value any) string {
	t.Helper()

	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal json: %v", err)
	}

	return string(raw)
}

func countFilesUnderRoot(t *testing.T, root string) int {
	t.Helper()

	count := 0
	if err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}

		count++
		return nil
	}); err != nil {
		t.Fatalf("walk storage root: %v", err)
	}

	return count
}
