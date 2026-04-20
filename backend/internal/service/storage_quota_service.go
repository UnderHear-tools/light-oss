package service

import (
	"context"
	"io"
	"net/http"
	"path/filepath"
	"sync"

	"go.uber.org/zap"

	apperrors "light-oss/backend/internal/pkg/errors"
	"light-oss/backend/internal/repository"
	"light-oss/backend/internal/storage"
)

const defaultStorageQuotaMaxBytes uint64 = 10 * 1024 * 1024 * 1024

type StorageLimitStatus string

const (
	StorageLimitStatusOK       StorageLimitStatus = "ok"
	StorageLimitStatusWarning  StorageLimitStatus = "warning"
	StorageLimitStatusExceeded StorageLimitStatus = "exceeded"
)

type StorageQuotaSnapshot struct {
	RootPath       string
	UsedBytes      uint64
	MaxBytes       uint64
	RemainingBytes uint64
	UsedPercent    float64
	LimitStatus    StorageLimitStatus
}

type StorageQuotaService struct {
	logger      *zap.Logger
	storageRoot string
	storage     *storage.LocalStorage
	objectRepo  *repository.ObjectRepository
	quotaRepo   *repository.StorageQuotaRepository
	writeMu     sync.Mutex
}

type StorageQuotaWriteSession struct {
	service *StorageQuotaService
}

func NewStorageQuotaService(
	logger *zap.Logger,
	storageRoot string,
	localStorage *storage.LocalStorage,
	objectRepo *repository.ObjectRepository,
	quotaRepo *repository.StorageQuotaRepository,
) *StorageQuotaService {
	return &StorageQuotaService{
		logger:      logger,
		storageRoot: storageRoot,
		storage:     localStorage,
		objectRepo:  objectRepo,
		quotaRepo:   quotaRepo,
	}
}

func (s *StorageQuotaService) Snapshot(ctx context.Context) (*StorageQuotaSnapshot, error) {
	return s.snapshot(ctx)
}

func (s *StorageQuotaService) UpdateMaxBytes(ctx context.Context, maxBytes uint64) (*StorageQuotaSnapshot, error) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	snapshot, err := s.snapshot(ctx)
	if err != nil {
		return nil, err
	}
	if maxBytes < snapshot.UsedBytes {
		return nil, apperrors.New(http.StatusConflict, "storage_limit_below_usage", "storage limit cannot be lower than current usage")
	}

	quota, err := s.quotaRepo.UpdateMaxBytes(ctx, maxBytes)
	if err != nil {
		return nil, apperrors.Wrap(http.StatusInternalServerError, "storage_limit_update_failed", "failed to update storage limit", err)
	}

	return buildStorageQuotaSnapshot(snapshot.RootPath, snapshot.UsedBytes, quota.MaxBytes), nil
}

func (s *StorageQuotaService) BeginWrite() *StorageQuotaWriteSession {
	s.writeMu.Lock()
	return &StorageQuotaWriteSession{service: s}
}

func (s *StorageQuotaWriteSession) Close() {
	if s == nil || s.service == nil {
		return
	}

	s.service.writeMu.Unlock()
}

func (s *StorageQuotaWriteSession) Save(ctx context.Context, reader io.Reader) (*storage.StoredFile, error) {
	stored, err := s.service.storage.Save(ctx, reader)
	if err != nil {
		return nil, err
	}

	snapshot, err := s.service.snapshot(ctx)
	if err != nil {
		s.DeletePaths([]string{stored.RelativePath})
		return nil, err
	}
	limitExceeded := snapshot.UsedBytes > snapshot.MaxBytes
	if stored.Size == 0 && snapshot.UsedBytes >= snapshot.MaxBytes {
		limitExceeded = true
	}
	if limitExceeded {
		s.DeletePaths([]string{stored.RelativePath})
		return nil, apperrors.New(http.StatusInsufficientStorage, "storage_limit_exceeded", "storage usage exceeds configured limit")
	}

	return stored, nil
}

func (s *StorageQuotaWriteSession) DeletePaths(paths []string) {
	for _, path := range uniqueStoragePaths(paths) {
		if err := s.service.storage.Delete(path); err != nil {
			s.service.logger.Warn("delete storage path failed", zap.String("storage_path", path), zap.Error(err))
		}
	}
}

func (s *StorageQuotaWriteSession) CleanupUnreferencedPaths(ctx context.Context, paths []string) {
	for _, path := range uniqueStoragePaths(paths) {
		exists, err := s.service.objectRepo.ExistsActiveByStoragePath(ctx, path)
		if err != nil {
			s.service.logger.Warn("check active storage reference failed", zap.String("storage_path", path), zap.Error(err))
			continue
		}
		if exists {
			continue
		}

		if err := s.service.storage.Delete(path); err != nil {
			s.service.logger.Warn("cleanup unreferenced storage path failed", zap.String("storage_path", path), zap.Error(err))
		}
	}
}

func (s *StorageQuotaService) snapshot(ctx context.Context) (*StorageQuotaSnapshot, error) {
	absStorageRoot, err := filepath.Abs(s.storageRoot)
	if err != nil {
		return nil, apperrors.Wrap(http.StatusInternalServerError, "storage_limit_unavailable", "failed to inspect storage usage", err)
	}

	usedBytes, err := directorySize(absStorageRoot)
	if err != nil {
		return nil, apperrors.Wrap(http.StatusInternalServerError, "storage_limit_unavailable", "failed to inspect storage usage", err)
	}

	quota, err := s.quotaRepo.EnsureDefault(ctx, defaultStorageQuotaMaxBytes)
	if err != nil {
		return nil, apperrors.Wrap(http.StatusInternalServerError, "storage_limit_unavailable", "failed to load storage limit", err)
	}

	return buildStorageQuotaSnapshot(absStorageRoot, usedBytes, quota.MaxBytes), nil
}

func buildStorageQuotaSnapshot(rootPath string, usedBytes uint64, maxBytes uint64) *StorageQuotaSnapshot {
	remainingBytes := uint64(0)
	if usedBytes < maxBytes {
		remainingBytes = maxBytes - usedBytes
	}

	usedPercent := 0.0
	if maxBytes > 0 {
		usedPercent = float64(usedBytes) / float64(maxBytes) * 100
	}

	limitStatus := StorageLimitStatusOK
	switch {
	case maxBytes > 0 && usedBytes >= maxBytes:
		limitStatus = StorageLimitStatusExceeded
	case maxBytes > 0 && usedPercent >= 80:
		limitStatus = StorageLimitStatusWarning
	}

	return &StorageQuotaSnapshot{
		RootPath:       rootPath,
		UsedBytes:      usedBytes,
		MaxBytes:       maxBytes,
		RemainingBytes: remainingBytes,
		UsedPercent:    usedPercent,
		LimitStatus:    limitStatus,
	}
}

func uniqueStoragePaths(paths []string) []string {
	seen := make(map[string]struct{}, len(paths))
	result := make([]string, 0, len(paths))

	for _, path := range paths {
		if path == "" {
			continue
		}
		if _, exists := seen[path]; exists {
			continue
		}

		seen[path] = struct{}{}
		result = append(result, path)
	}

	return result
}
