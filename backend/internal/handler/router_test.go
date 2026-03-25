package handler_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
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
	Data T `json:"data"`
}

type bucketResponse struct {
	ID   uint64 `json:"id"`
	Name string `json:"name"`
}

type bucketListResponse struct {
	Items []bucketResponse `json:"items"`
}

type objectResponse struct {
	ObjectKey  string `json:"object_key"`
	Visibility string `json:"visibility"`
	Size       int64  `json:"size"`
}

type objectListResponse struct {
	Items      []objectResponse `json:"items"`
	NextCursor string           `json:"next_cursor"`
}

type signResponse struct {
	URL string `json:"url"`
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

func newTestRouter(t *testing.T, maxUploadSize int64) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)

	dsn := fmt.Sprintf("file:%d?mode=memory&cache=shared", time.Now().UnixNano())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}

	if err := db.AutoMigrate(&model.Bucket{}, &model.Object{}); err != nil {
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
	localStorage := storage.NewLocalStorage(root)
	return handler.NewRouter(handler.Dependencies{
		Config:        cfg,
		Logger:        zap.NewNop(),
		DB:            sqlDB,
		GormDB:        db,
		AuthValidator: middleware.NewTokenValidator(cfg.BearerTokens),
		BucketService: service.NewBucketService(bucketRepo),
		ObjectService: service.NewObjectService(bucketRepo, objectRepo, localStorage),
		SignService:   service.NewSignService(signing.NewSigner(cfg.SigningSecret), cfg.PublicBaseURL, cfg.DefaultSignedURLTTLSeconds, cfg.MaxSignedURLTTLSeconds),
	})
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
	req := httptest.NewRequest(http.MethodPut, path, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer dev-token")
	req.Header.Set("X-Object-Visibility", visibility)
	req.Header.Set("X-Original-Filename", "file.txt")
	req.Header.Set("Content-Type", "text/plain")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("upload expected 201, got %d, body=%s", rec.Code, rec.Body.String())
	}
}

func decodeJSON(t *testing.T, body []byte, target any) {
	t.Helper()
	if err := json.Unmarshal(body, target); err != nil {
		t.Fatalf("decode json: %v, body=%s", err, string(body))
	}
}
