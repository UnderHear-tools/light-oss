package handler_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type systemStatsResponse struct {
	OS      string                `json:"os"`
	CPU     systemCPUResponse     `json:"cpu"`
	Memory  systemMemoryResponse  `json:"memory"`
	Disks   []systemDiskResponse  `json:"disks"`
	Storage systemStorageResponse `json:"storage"`
}

type systemCPUResponse struct {
	UsedPercent float64 `json:"used_percent"`
}

type systemMemoryResponse struct {
	TotalBytes     uint64  `json:"total_bytes"`
	UsedBytes      uint64  `json:"used_bytes"`
	AvailableBytes uint64  `json:"available_bytes"`
	UsedPercent    float64 `json:"used_percent"`
}

type systemDiskResponse struct {
	Label               string  `json:"label"`
	MountPoint          string  `json:"mount_point"`
	Filesystem          string  `json:"filesystem"`
	TotalBytes          uint64  `json:"total_bytes"`
	UsedBytes           uint64  `json:"used_bytes"`
	FreeBytes           uint64  `json:"free_bytes"`
	UsedPercent         float64 `json:"used_percent"`
	ContainsStorageRoot bool    `json:"contains_storage_root"`
}

type systemStorageResponse struct {
	RootPath  string `json:"root_path"`
	UsedBytes uint64 `json:"used_bytes"`
}

func TestProtectedSystemStatsRequireAuth(t *testing.T) {
	router := newTestRouter(t, 1024)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/system/stats", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestProtectedSystemStatsReturnsMetrics(t *testing.T) {
	router, storageRoot := newTestRouterWithStorageRoot(t, 1024)

	createBucket(t, router, "system-stats")
	uploadObject(t, router, "/api/v1/buckets/system-stats/objects/docs/report.txt", strings.Repeat("a", 32), "public")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/system/stats", nil)
	req.Header.Set("Authorization", "Bearer dev-token")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", rec.Code, rec.Body.String())
	}

	var body apiEnvelope[systemStatsResponse]
	decodeJSON(t, rec.Body.Bytes(), &body)

	if body.Data.OS == "" {
		t.Fatalf("expected os value, got empty string")
	}
	if body.Data.CPU.UsedPercent < 0 {
		t.Fatalf("expected cpu percent >= 0, got %f", body.Data.CPU.UsedPercent)
	}
	if body.Data.Memory.TotalBytes == 0 {
		t.Fatalf("expected memory total bytes > 0")
	}
	if body.Data.Storage.UsedBytes == 0 {
		t.Fatalf("expected storage used bytes > 0")
	}
	if body.Data.Storage.RootPath == "" {
		t.Fatalf("expected storage root path")
	}

	storageRootMatched := false
	for _, item := range body.Data.Disks {
		if item.TotalBytes == 0 {
			t.Fatalf("expected disk total bytes > 0, got %+v", item)
		}
		if item.ContainsStorageRoot {
			storageRootMatched = true
		}
	}

	if !storageRootMatched {
		t.Fatalf("expected at least one disk to contain storage root %q, got %+v", storageRoot, body.Data.Disks)
	}
}
