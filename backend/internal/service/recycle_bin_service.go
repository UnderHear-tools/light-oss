package service

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"

	"light-oss/backend/internal/model"
	apperrors "light-oss/backend/internal/pkg/errors"
	"light-oss/backend/internal/repository"
)

type RecycleBinItemType string

const (
	RecycleBinItemTypeFile      RecycleBinItemType = "file"
	RecycleBinItemTypeDirectory RecycleBinItemType = "directory"
)

type RecycleBinObjectItem struct {
	ID               uint64
	Type             RecycleBinItemType
	BucketName       string
	Path             string
	Name             string
	ObjectKey        string
	OriginalFilename string
	Size             int64
	ContentType      string
	ETag             string
	Visibility       model.Visibility
	CreatedAt        time.Time
	DeletedAt        time.Time
}

type ListRecycleBinObjectsInput struct {
	BucketName string
	Limit  int
	Cursor string
}

type ListRecycleBinObjectsOutput struct {
	Items      []RecycleBinObjectItem
	NextCursor string
}

type RecycleBinFailedItem struct {
	ID         uint64
	BucketName string
	Path       string
	Code       string
	Message    string
}

type RestoreRecycleBinObjectsOutput struct {
	RestoredCount int
	FailedCount   int
	FailedItems   []RecycleBinFailedItem
}

type DeleteRecycleBinObjectsOutput struct {
	DeletedCount int
	FailedCount  int
	FailedItems  []RecycleBinFailedItem
}

type RecycleBinService struct {
	gormDB      *gorm.DB
	bucketRepo  *repository.BucketRepository
	objectRepo  *repository.ObjectRepository
	recycleRepo *repository.RecycleBinRepository
	quota       *StorageQuotaService
}

func NewRecycleBinService(
	gormDB *gorm.DB,
	bucketRepo *repository.BucketRepository,
	objectRepo *repository.ObjectRepository,
	recycleRepo *repository.RecycleBinRepository,
	quota *StorageQuotaService,
) *RecycleBinService {
	return &RecycleBinService{
		gormDB:      gormDB,
		bucketRepo:  bucketRepo,
		objectRepo:  objectRepo,
		recycleRepo: recycleRepo,
		quota:       quota,
	}
}

func (s *RecycleBinService) ListObjects(ctx context.Context, input ListRecycleBinObjectsInput) (*ListRecycleBinObjectsOutput, error) {
	if strings.TrimSpace(input.BucketName) != "" {
		if err := ValidateBucketName(input.BucketName); err != nil {
			return nil, err
		}
	}

	limit := input.Limit
	if limit <= 0 {
		limit = defaultListLimit
	}
	if limit > maxListLimit {
		limit = maxListLimit
	}

	cursor, err := decodeRecycleBinCursor(input.Cursor)
	if err != nil {
		return nil, apperrors.New(http.StatusBadRequest, "invalid_cursor", "cursor is invalid")
	}

	items, err := s.recycleRepo.List(ctx, repository.ListRecycleBinObjectsParams{
		BucketName: input.BucketName,
		Limit:  limit + 1,
		Cursor: cursor,
	})
	if err != nil {
		return nil, apperrors.Wrap(http.StatusInternalServerError, "recycle_bin_list_failed", "failed to list recycle bin objects", err)
	}

	nextCursor := ""
	if len(items) > limit {
		last := items[limit-1]
		nextCursor = encodeRecycleBinCursor(last.DeletedAt, last.ID)
		items = items[:limit]
	}

	result := make([]RecycleBinObjectItem, 0, len(items))
	for _, item := range items {
		result = append(result, recycleBinObjectToItem(item))
	}

	return &ListRecycleBinObjectsOutput{
		Items:      result,
		NextCursor: nextCursor,
	}, nil
}

func (s *RecycleBinService) RestoreObjects(ctx context.Context, itemIDs []uint64) (*RestoreRecycleBinObjectsOutput, error) {
	normalizedIDs, err := validateRecycleBinItemIDs(itemIDs)
	if err != nil {
		return nil, err
	}

	result := &RestoreRecycleBinObjectsOutput{
		FailedItems: make([]RecycleBinFailedItem, 0),
	}

	for _, itemID := range normalizedIDs {
		failedItem, restoreErr := s.restoreObject(ctx, itemID)
		if restoreErr == nil {
			result.RestoredCount++
			continue
		}

		if failedItem.ID == 0 {
			failedItem.ID = itemID
		}

		appErr := apperrors.From(restoreErr)
		failedItem.Code = appErr.Code
		failedItem.Message = appErr.Message
		result.FailedItems = append(result.FailedItems, failedItem)
	}

	result.FailedCount = len(result.FailedItems)
	return result, nil
}

func (s *RecycleBinService) DeleteObjects(ctx context.Context, itemIDs []uint64) (*DeleteRecycleBinObjectsOutput, error) {
	normalizedIDs, err := validateRecycleBinItemIDs(itemIDs)
	if err != nil {
		return nil, err
	}

	result := &DeleteRecycleBinObjectsOutput{
		FailedItems: make([]RecycleBinFailedItem, 0),
	}
	storagePaths := make([]string, 0, len(normalizedIDs))

	for _, itemID := range normalizedIDs {
		failedItem, path, deleteErr := s.deleteObject(ctx, itemID)
		if deleteErr == nil {
			result.DeletedCount++
			if path != "" {
				storagePaths = append(storagePaths, path)
			}
			continue
		}

		if failedItem.ID == 0 {
			failedItem.ID = itemID
		}

		appErr := apperrors.From(deleteErr)
		failedItem.Code = appErr.Code
		failedItem.Message = appErr.Message
		result.FailedItems = append(result.FailedItems, failedItem)
	}

	if len(storagePaths) > 0 {
		writeSession := s.quota.BeginWrite()
		writeSession.CleanupUnreferencedPaths(ctx, storagePaths)
		writeSession.Close()
	}

	result.FailedCount = len(result.FailedItems)
	return result, nil
}

func (s *RecycleBinService) restoreObject(ctx context.Context, itemID uint64) (RecycleBinFailedItem, error) {
	failedItem := RecycleBinFailedItem{ID: itemID}

	err := s.gormDB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		recycleRepo := s.recycleRepo.WithDB(tx)
		objectRepo := s.objectRepo.WithDB(tx)
		bucketRepo := s.bucketRepo.WithDB(tx)

		item, err := recycleRepo.Find(ctx, itemID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return apperrors.New(http.StatusNotFound, "recycle_bin_item_not_found", "recycle bin item not found")
			}

			return apperrors.Wrap(http.StatusInternalServerError, "recycle_bin_restore_failed", "failed to load recycle bin item", err)
		}

		failedItem.BucketName = item.BucketName
		failedItem.Path = recycleBinObjectPath(*item)

		exists, err := bucketRepo.Exists(ctx, item.BucketName)
		if err != nil {
			return apperrors.Wrap(http.StatusInternalServerError, "bucket_lookup_failed", "failed to look up bucket", err)
		}
		if !exists {
			return apperrors.New(http.StatusNotFound, "bucket_not_found", "bucket not found")
		}

		activeExists, err := objectRepo.ExistsActive(ctx, item.BucketName, item.ObjectKey)
		if err != nil {
			return apperrors.Wrap(http.StatusInternalServerError, "object_lookup_failed", "failed to look up object", err)
		}
		if activeExists {
			return apperrors.New(http.StatusConflict, "object_exists", "object already exists")
		}

		object := &model.Object{
			BucketName:       item.BucketName,
			ObjectKey:        item.ObjectKey,
			OriginalFilename: item.OriginalFilename,
			StoragePath:      item.StoragePath,
			Size:             item.Size,
			ContentType:      item.ContentType,
			ETag:             item.ETag,
			FileFingerprint:  item.FileFingerprint,
			Visibility:       item.Visibility,
			IsDeleted:        false,
			CreatedAt:        item.CreatedAt,
			UpdatedAt:        time.Now().UTC(),
		}

		if err := tx.WithContext(ctx).Create(object).Error; err != nil {
			if errors.Is(err, gorm.ErrDuplicatedKey) || isDuplicateError(err) {
				return apperrors.New(http.StatusConflict, "object_exists", "object already exists")
			}
			if isForeignKeyError(err) {
				return apperrors.New(http.StatusNotFound, "bucket_not_found", "bucket not found")
			}

			return apperrors.Wrap(http.StatusInternalServerError, "recycle_bin_restore_failed", "failed to restore object", err)
		}

		deleted, err := recycleRepo.HardDelete(ctx, item.ID)
		if err != nil {
			return apperrors.Wrap(http.StatusInternalServerError, "recycle_bin_restore_failed", "failed to remove recycle bin item", err)
		}
		if !deleted {
			return apperrors.New(http.StatusNotFound, "recycle_bin_item_not_found", "recycle bin item not found")
		}

		return nil
	})
	return failedItem, err
}

func (s *RecycleBinService) deleteObject(ctx context.Context, itemID uint64) (RecycleBinFailedItem, string, error) {
	failedItem := RecycleBinFailedItem{ID: itemID}
	storagePath := ""

	err := s.gormDB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		recycleRepo := s.recycleRepo.WithDB(tx)

		item, err := recycleRepo.Find(ctx, itemID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return apperrors.New(http.StatusNotFound, "recycle_bin_item_not_found", "recycle bin item not found")
			}

			return apperrors.Wrap(http.StatusInternalServerError, "recycle_bin_delete_failed", "failed to load recycle bin item", err)
		}

		failedItem.BucketName = item.BucketName
		failedItem.Path = recycleBinObjectPath(*item)
		storagePath = item.StoragePath

		deleted, err := recycleRepo.HardDelete(ctx, item.ID)
		if err != nil {
			return apperrors.Wrap(http.StatusInternalServerError, "recycle_bin_delete_failed", "failed to delete recycle bin item", err)
		}
		if !deleted {
			return apperrors.New(http.StatusNotFound, "recycle_bin_item_not_found", "recycle bin item not found")
		}

		return nil
	})

	return failedItem, storagePath, err
}

func validateRecycleBinItemIDs(itemIDs []uint64) ([]uint64, error) {
	if len(itemIDs) == 0 {
		return nil, apperrors.New(http.StatusBadRequest, "invalid_request", "item_ids must contain at least one entry")
	}
	if len(itemIDs) > maxExplorerLimit {
		return nil, apperrors.New(http.StatusBadRequest, "invalid_request", "item_ids must contain at most 200 entries")
	}

	seen := make(map[uint64]struct{}, len(itemIDs))
	normalized := make([]uint64, 0, len(itemIDs))
	for _, itemID := range itemIDs {
		if itemID == 0 {
			return nil, apperrors.New(http.StatusBadRequest, "invalid_request", "item_ids must contain positive integers")
		}
		if _, exists := seen[itemID]; exists {
			continue
		}

		seen[itemID] = struct{}{}
		normalized = append(normalized, itemID)
	}

	return normalized, nil
}

func recycleBinObjectToItem(item model.RecycleBinObject) RecycleBinObjectItem {
	return RecycleBinObjectItem{
		ID:               item.ID,
		Type:             recycleBinObjectType(item),
		BucketName:       item.BucketName,
		Path:             recycleBinObjectPath(item),
		Name:             recycleBinObjectName(item),
		ObjectKey:        item.ObjectKey,
		OriginalFilename: item.OriginalFilename,
		Size:             item.Size,
		ContentType:      item.ContentType,
		ETag:             item.ETag,
		Visibility:       item.Visibility,
		CreatedAt:        item.CreatedAt,
		DeletedAt:        item.DeletedAt,
	}
}

func recycleBinObjectType(item model.RecycleBinObject) RecycleBinItemType {
	if isFolderMarkerKey(item.ObjectKey) {
		return RecycleBinItemTypeDirectory
	}

	return RecycleBinItemTypeFile
}

func recycleBinObjectPath(item model.RecycleBinObject) string {
	if isFolderMarkerKey(item.ObjectKey) {
		return strings.TrimSuffix(item.ObjectKey, folderMarkerFilename)
	}

	return item.ObjectKey
}

func recycleBinObjectName(item model.RecycleBinObject) string {
	entryPath := strings.TrimSuffix(recycleBinObjectPath(item), "/")
	if entryPath == "" {
		return item.OriginalFilename
	}

	return path.Base(entryPath)
}

func encodeRecycleBinCursor(deletedAt time.Time, id uint64) string {
	raw := fmt.Sprintf("%d|%d", deletedAt.UTC().UnixNano(), id)
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeRecycleBinCursor(value string) (*repository.RecycleBinCursor, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}

	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return nil, err
	}

	parts := strings.Split(string(raw), "|")
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid cursor")
	}

	nanos, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return nil, err
	}
	id, err := strconv.ParseUint(parts[1], 10, 64)
	if err != nil {
		return nil, err
	}

	return &repository.RecycleBinCursor{
		DeletedAt: time.Unix(0, nanos).UTC(),
		ID:        id,
	}, nil
}
