package service

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"

	"light-oss/backend/internal/model"
	apperrors "light-oss/backend/internal/pkg/errors"
	"light-oss/backend/internal/repository"
	"light-oss/backend/internal/storage"
)

const (
	defaultListLimit = 20
	maxListLimit     = 100
)

type UploadObjectInput struct {
	BucketName       string
	ObjectKey        string
	Visibility       string
	AllowOverwrite   bool
	OriginalFilename string
	ContentType      string
	Body             io.Reader
}

type ListObjectsInput struct {
	BucketName string
	Prefix     string
	Limit      int
	Cursor     string
}

type ListObjectsOutput struct {
	Items      []model.Object
	NextCursor string
}

type ObjectService struct {
	gormDB      *gorm.DB
	bucketRepo  *repository.BucketRepository
	objectRepo  *repository.ObjectRepository
	recycleRepo *repository.RecycleBinRepository
	storage     *storage.LocalStorage
	quota       *StorageQuotaService
}

func NewObjectService(
	gormDB *gorm.DB,
	bucketRepo *repository.BucketRepository,
	objectRepo *repository.ObjectRepository,
	recycleRepo *repository.RecycleBinRepository,
	localStorage *storage.LocalStorage,
	quotaService *StorageQuotaService,
) *ObjectService {
	return &ObjectService{
		gormDB:      gormDB,
		bucketRepo:  bucketRepo,
		objectRepo:  objectRepo,
		recycleRepo: recycleRepo,
		storage:     localStorage,
		quota:       quotaService,
	}
}

func (s *ObjectService) Upload(ctx context.Context, input UploadObjectInput) (*model.Object, error) {
	if err := ValidateBucketName(input.BucketName); err != nil {
		return nil, err
	}
	if err := ValidateUserObjectKey(input.ObjectKey); err != nil {
		return nil, err
	}

	visibility, err := ParseVisibility(input.Visibility)
	if err != nil {
		return nil, err
	}

	if err := s.ensureBucketExists(ctx, input.BucketName); err != nil {
		return nil, err
	}

	var existing *model.Object
	if !input.AllowOverwrite {
		exists, err := s.objectRepo.ExistsActive(ctx, input.BucketName, input.ObjectKey)
		if err != nil {
			return nil, apperrors.Wrap(http.StatusInternalServerError, "object_lookup_failed", "failed to look up object", err)
		}
		if exists {
			return nil, apperrors.New(http.StatusConflict, "object_exists", "object already exists; set X-Allow-Overwrite=true to overwrite")
		}
	} else {
		existing, err = s.findActiveObject(ctx, input.BucketName, input.ObjectKey)
		if err != nil {
			return nil, apperrors.Wrap(http.StatusInternalServerError, "object_lookup_failed", "failed to look up object", err)
		}
	}

	writeSession := s.quota.BeginWrite()
	defer writeSession.Close()

	stored, err := writeSession.Save(ctx, input.Body)
	if err != nil {
		if appErr := apperrors.From(err); appErr.Code != "internal_error" {
			return nil, err
		}

		return nil, apperrors.Wrap(http.StatusInternalServerError, "object_store_failed", "failed to store object", err)
	}

	object := &model.Object{
		BucketName:       input.BucketName,
		ObjectKey:        input.ObjectKey,
		OriginalFilename: SanitizeOriginalFilename(input.OriginalFilename),
		StoragePath:      stored.RelativePath,
		Size:             stored.Size,
		ContentType:      NormalizeContentType(input.ContentType),
		ETag:             stored.ETag,
		Visibility:       visibility,
		IsDeleted:        false,
	}

	saved, err := s.objectRepo.Upsert(ctx, object)
	if err != nil {
		writeSession.DeletePaths([]string{stored.RelativePath})
		if isForeignKeyError(err) {
			return nil, apperrors.New(http.StatusNotFound, "bucket_not_found", "bucket not found")
		}

		return nil, apperrors.Wrap(http.StatusInternalServerError, "object_metadata_failed", "failed to save object metadata", err)
	}

	if existing != nil {
		writeSession.CleanupUnreferencedPaths(ctx, []string{existing.StoragePath})
	}

	return saved, nil
}

func (s *ObjectService) Open(ctx context.Context, bucketName string, objectKey string) (*model.Object, io.ReadCloser, error) {
	object, err := s.GetMetadata(ctx, bucketName, objectKey)
	if err != nil {
		return nil, nil, err
	}

	reader, err := s.storage.Open(object.StoragePath)
	if err != nil {
		return nil, nil, apperrors.Wrap(http.StatusInternalServerError, "object_open_failed", "failed to open object content", err)
	}

	return object, reader, nil
}

func (s *ObjectService) GetMetadata(ctx context.Context, bucketName string, objectKey string) (*model.Object, error) {
	if err := ValidateBucketName(bucketName); err != nil {
		return nil, err
	}
	if err := ValidateObjectKey(objectKey); err != nil {
		return nil, err
	}

	object, err := s.objectRepo.FindActive(ctx, bucketName, objectKey)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperrors.New(http.StatusNotFound, "object_not_found", "object not found")
		}

		return nil, apperrors.Wrap(http.StatusInternalServerError, "object_lookup_failed", "failed to look up object", err)
	}

	return object, nil
}

func (s *ObjectService) List(ctx context.Context, input ListObjectsInput) (*ListObjectsOutput, error) {
	if err := ValidateBucketName(input.BucketName); err != nil {
		return nil, err
	}
	if err := ValidatePrefix(input.Prefix); err != nil {
		return nil, err
	}
	if err := s.ensureBucketExists(ctx, input.BucketName); err != nil {
		return nil, err
	}

	limit := input.Limit
	if limit <= 0 {
		limit = defaultListLimit
	}
	if limit > maxListLimit {
		limit = maxListLimit
	}

	cursor, err := decodeCursor(input.Cursor)
	if err != nil {
		return nil, apperrors.New(http.StatusBadRequest, "invalid_cursor", "cursor is invalid")
	}

	objects, err := s.objectRepo.ListActive(ctx, repository.ListObjectsParams{
		BucketName: input.BucketName,
		Prefix:     input.Prefix,
		Limit:      limit + 1,
		Cursor:     cursor,
	})
	if err != nil {
		return nil, apperrors.Wrap(http.StatusInternalServerError, "object_list_failed", "failed to list objects", err)
	}

	nextCursor := ""
	if len(objects) > limit {
		last := objects[limit-1]
		nextCursor = encodeCursor(last.CreatedAt, last.ID)
		objects = objects[:limit]
	}

	return &ListObjectsOutput{
		Items:      objects,
		NextCursor: nextCursor,
	}, nil
}

func (s *ObjectService) Delete(ctx context.Context, bucketName string, objectKey string) error {
	if err := ValidateBucketName(bucketName); err != nil {
		return err
	}
	if err := ValidateObjectKey(objectKey); err != nil {
		return err
	}

	writeSession := s.quota.BeginWrite()
	defer writeSession.Close()

	err := s.gormDB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		objectRepo := s.objectRepo.WithDB(tx)
		recycleRepo := s.recycleRepo.WithDB(tx)

		object, err := objectRepo.FindActive(ctx, bucketName, objectKey)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return gorm.ErrRecordNotFound
			}

			return apperrors.Wrap(http.StatusInternalServerError, "object_lookup_failed", "failed to look up object", err)
		}

		if err := recycleRepo.CreateBatch(ctx, recycleBinObjectsFromObjects([]model.Object{*object}, time.Now().UTC())); err != nil {
			return apperrors.Wrap(http.StatusInternalServerError, "object_delete_failed", "failed to move object to recycle bin", err)
		}

		deleted, err := objectRepo.HardDelete(ctx, bucketName, objectKey)
		if err != nil {
			return apperrors.Wrap(http.StatusInternalServerError, "object_delete_failed", "failed to delete object", err)
		}
		if !deleted {
			return gorm.ErrRecordNotFound
		}

		return nil
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return apperrors.New(http.StatusNotFound, "object_not_found", "object not found")
		}
		if appErr := apperrors.From(err); appErr.Code != "internal_error" {
			return err
		}

		return apperrors.Wrap(http.StatusInternalServerError, "object_delete_failed", "failed to delete object", err)
	}

	return nil
}

func (s *ObjectService) UpdateVisibility(
	ctx context.Context,
	bucketName string,
	objectKey string,
	visibilityValue string,
) (*model.Object, error) {
	if err := ValidateBucketName(bucketName); err != nil {
		return nil, err
	}
	if err := ValidateObjectKey(objectKey); err != nil {
		return nil, err
	}

	visibility, err := ParseVisibility(visibilityValue)
	if err != nil {
		return nil, err
	}

	object, err := s.objectRepo.UpdateVisibility(ctx, bucketName, objectKey, visibility)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperrors.New(http.StatusNotFound, "object_not_found", "object not found")
		}

		return nil, apperrors.Wrap(http.StatusInternalServerError, "object_update_failed", "failed to update object visibility", err)
	}

	return object, nil
}

func encodeCursor(createdAt time.Time, id uint64) string {
	raw := fmt.Sprintf("%d|%d", createdAt.UTC().UnixNano(), id)
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeCursor(value string) (*repository.Cursor, error) {
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

	return &repository.Cursor{
		CreatedAt: time.Unix(0, nanos).UTC(),
		ID:        id,
	}, nil
}

func NormalizeContentType(contentType string) string {
	trimmed := strings.TrimSpace(contentType)
	if trimmed == "" {
		return "application/octet-stream"
	}

	mediaType, params, err := mime.ParseMediaType(trimmed)
	if err != nil {
		return trimmed
	}
	if _, hasCharset := params["charset"]; hasCharset || !shouldAttachUTF8Charset(mediaType) {
		return trimmed
	}

	params["charset"] = "utf-8"
	normalized := mime.FormatMediaType(mediaType, params)
	if normalized == "" {
		return mediaType + "; charset=utf-8"
	}

	return normalized
}

func shouldAttachUTF8Charset(mediaType string) bool {
	normalized := strings.ToLower(strings.TrimSpace(mediaType))
	if strings.HasPrefix(normalized, "text/") {
		return true
	}
	if strings.HasSuffix(normalized, "+json") || strings.HasSuffix(normalized, "+xml") {
		return true
	}

	switch normalized {
	case "application/json", "application/ld+json", "application/xml", "application/xhtml+xml", "image/svg+xml":
		return true
	default:
		return false
	}
}

func (s *ObjectService) ensureBucketExists(ctx context.Context, bucketName string) error {
	exists, err := s.bucketRepo.Exists(ctx, bucketName)
	if err != nil {
		return apperrors.Wrap(http.StatusInternalServerError, "bucket_lookup_failed", "failed to look up bucket", err)
	}
	if !exists {
		return apperrors.New(http.StatusNotFound, "bucket_not_found", "bucket not found")
	}

	return nil
}

func (s *ObjectService) findActiveObject(ctx context.Context, bucketName string, objectKey string) (*model.Object, error) {
	object, err := s.objectRepo.FindActive(ctx, bucketName, objectKey)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}

		return nil, err
	}

	return object, nil
}

func (s *ObjectService) loadActiveObjectsByKeys(
	ctx context.Context,
	bucketName string,
	objectKeys []string,
) (map[string]model.Object, error) {
	objects, err := s.objectRepo.FindActiveByKeys(ctx, bucketName, objectKeys)
	if err != nil {
		return nil, err
	}

	result := make(map[string]model.Object, len(objects))
	for _, object := range objects {
		result[object.ObjectKey] = object
	}

	return result, nil
}

func storagePathsFromObjects(objects []model.Object) []string {
	paths := make([]string, 0, len(objects))
	for _, object := range objects {
		if object.StoragePath == "" {
			continue
		}

		paths = append(paths, object.StoragePath)
	}

	return paths
}

func recycleBinObjectsFromObjects(objects []model.Object, deletedAt time.Time) []model.RecycleBinObject {
	items := make([]model.RecycleBinObject, 0, len(objects))
	for _, object := range objects {
		items = append(items, model.RecycleBinObject{
			BucketName:       object.BucketName,
			ObjectKey:        object.ObjectKey,
			OriginalFilename: object.OriginalFilename,
			StoragePath:      object.StoragePath,
			Size:             object.Size,
			ContentType:      object.ContentType,
			ETag:             object.ETag,
			FileFingerprint:  object.FileFingerprint,
			Visibility:       object.Visibility,
			CreatedAt:        object.CreatedAt,
			DeletedAt:        deletedAt,
		})
	}

	return items
}
