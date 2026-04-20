package service

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"gorm.io/gorm"

	"light-oss/backend/internal/model"
	apperrors "light-oss/backend/internal/pkg/errors"
	"light-oss/backend/internal/repository"
	"light-oss/backend/internal/storage"
)

type PublishSiteUploadInput struct {
	BucketName    string
	ParentPrefix  string
	Enabled       bool
	IndexDocument string
	ErrorDocument string
	SPAFallback   bool
	Domains       []string
	Items         []UploadObjectBatchItemInput
}

type PublishSiteUploadOutput struct {
	UploadedCount int
	Site          *model.Site
}

type SitePublishService struct {
	gormDB      *gorm.DB
	objectRepo  *repository.ObjectRepository
	siteRepo    *repository.SiteRepository
	storage     *storage.LocalStorage
	siteService *SiteService
	quota       *StorageQuotaService
}

func NewSitePublishService(
	gormDB *gorm.DB,
	objectRepo *repository.ObjectRepository,
	siteRepo *repository.SiteRepository,
	localStorage *storage.LocalStorage,
	quotaService *StorageQuotaService,
	siteService *SiteService,
) *SitePublishService {
	return &SitePublishService{
		gormDB:      gormDB,
		objectRepo:  objectRepo,
		siteRepo:    siteRepo,
		storage:     localStorage,
		quota:       quotaService,
		siteService: siteService,
	}
}

func (s *SitePublishService) Publish(
	ctx context.Context,
	input PublishSiteUploadInput,
) (*PublishSiteUploadOutput, error) {
	if len(input.Items) == 0 {
		return nil, apperrors.New(http.StatusBadRequest, "invalid_batch_manifest", "manifest must contain at least one file")
	}
	if len(input.Domains) == 0 {
		return nil, apperrors.New(http.StatusBadRequest, "invalid_request", "domains is required")
	}

	parentPrefix, err := normalizePublishParentPrefix(input.ParentPrefix)
	if err != nil {
		return nil, err
	}

	topLevelFolder, err := sharedTopLevelFolderName(input.Items)
	if err != nil {
		return nil, err
	}

	site, domains, err := s.siteService.buildSiteInput(ctx, SiteInput{
		BucketName:    input.BucketName,
		RootPrefix:    parentPrefix + topLevelFolder + "/",
		Enabled:       input.Enabled,
		IndexDocument: input.IndexDocument,
		ErrorDocument: input.ErrorDocument,
		SPAFallback:   input.SPAFallback,
		Domains:       input.Domains,
	})
	if err != nil {
		return nil, err
	}

	storedPaths := make([]string, 0, len(input.Items))
	uploadedCount := 0
	var createdSite *model.Site
	objectKeys := make([]string, 0, len(input.Items))
	for _, item := range input.Items {
		objectKeys = append(objectKeys, parentPrefix+item.RelativePath)
	}

	existingObjectsByKey, err := s.siteService.objectService.loadActiveObjectsByKeys(ctx, input.BucketName, objectKeys)
	if err != nil {
		return nil, apperrors.Wrap(http.StatusInternalServerError, "object_lookup_failed", "failed to look up objects", err)
	}
	replacedPaths := make([]string, 0, len(existingObjectsByKey))

	writeSession := s.quota.BeginWrite()
	defer writeSession.Close()

	err = s.gormDB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		objectRepo := s.objectRepo.WithDB(tx)
		siteRepo := s.siteRepo.WithDB(tx)
		seenObjectKeys := make(map[string]struct{}, len(input.Items))

		for _, item := range input.Items {
			if err := ValidateUploadRelativePath(item.RelativePath); err != nil {
				return invalidBatchManifestError(err)
			}

			objectKey := parentPrefix + item.RelativePath
			if err := ValidateUserObjectKey(objectKey); err != nil {
				return invalidBatchManifestError(err)
			}
			if _, exists := seenObjectKeys[objectKey]; exists {
				return apperrors.New(http.StatusBadRequest, "invalid_batch_manifest", "manifest contains duplicate object keys")
			}
			seenObjectKeys[objectKey] = struct{}{}

			reader, err := item.Open()
			if err != nil {
				return apperrors.Wrap(http.StatusInternalServerError, "batch_file_open_failed", "failed to open uploaded file", err)
			}

			stored, err := writeSession.Save(ctx, reader)
			closeErr := reader.Close()
			if err != nil {
				if appErr := apperrors.From(err); appErr.Code != "internal_error" {
					return err
				}

				return apperrors.Wrap(http.StatusInternalServerError, "object_store_failed", "failed to store object", err)
			}
			if closeErr != nil {
				writeSession.DeletePaths([]string{stored.RelativePath})
				return apperrors.Wrap(http.StatusInternalServerError, "batch_file_open_failed", "failed to close uploaded file", closeErr)
			}

			storedPaths = append(storedPaths, stored.RelativePath)

			object := &model.Object{
				BucketName:       input.BucketName,
				ObjectKey:        objectKey,
				OriginalFilename: SanitizeOriginalFilename(item.OriginalFilename),
				StoragePath:      stored.RelativePath,
				Size:             stored.Size,
				ContentType:      NormalizeContentType(item.ContentType),
				ETag:             stored.ETag,
				Visibility:       model.VisibilityPublic,
				IsDeleted:        false,
			}

			if _, err := objectRepo.Upsert(ctx, object); err != nil {
				if isForeignKeyError(err) {
					return apperrors.New(http.StatusNotFound, "bucket_not_found", "bucket not found")
				}

				return apperrors.Wrap(http.StatusInternalServerError, "object_metadata_failed", "failed to save object metadata", err)
			}

			uploadedCount++
			if existingObject, exists := existingObjectsByKey[objectKey]; exists {
				replacedPaths = append(replacedPaths, existingObject.StoragePath)
			}
		}

		createdSite, err = siteRepo.Create(ctx, site, domains)
		if err != nil {
			return err
		}

		return nil
	})
	if err != nil {
		writeSession.DeletePaths(storedPaths)

		if errors.Is(err, gorm.ErrDuplicatedKey) || isDuplicateError(err) {
			return nil, apperrors.New(http.StatusConflict, "domain_conflict", "domain is already bound to another site")
		}
		if isForeignKeyError(err) {
			return nil, apperrors.New(http.StatusNotFound, "bucket_not_found", "bucket not found")
		}

		if appErr := apperrors.From(err); appErr.Code != "internal_error" {
			return nil, err
		}

		return nil, apperrors.Wrap(http.StatusInternalServerError, "site_create_failed", "failed to create site", err)
	}

	writeSession.CleanupUnreferencedPaths(ctx, replacedPaths)

	return &PublishSiteUploadOutput{
		UploadedCount: uploadedCount,
		Site:          createdSite,
	}, nil
}

func sharedTopLevelFolderName(items []UploadObjectBatchItemInput) (string, error) {
	topLevelFolder := ""

	for _, item := range items {
		if err := ValidateUploadRelativePath(item.RelativePath); err != nil {
			return "", invalidBatchManifestError(err)
		}

		segments := strings.Split(item.RelativePath, "/")
		if len(segments) < 2 {
			return "", apperrors.New(http.StatusBadRequest, "invalid_batch_manifest", "manifest entry must include a top-level folder")
		}

		currentTopLevel := strings.TrimSpace(segments[0])
		if currentTopLevel == "" {
			return "", apperrors.New(http.StatusBadRequest, "invalid_batch_manifest", "manifest entry is invalid")
		}

		if topLevelFolder == "" {
			topLevelFolder = currentTopLevel
			continue
		}
		if currentTopLevel != topLevelFolder {
			return "", apperrors.New(http.StatusBadRequest, "invalid_batch_manifest", "manifest entries must share the same top-level folder")
		}
	}

	return topLevelFolder, nil
}

func normalizePublishParentPrefix(value string) (string, error) {
	normalized := strings.TrimSpace(strings.ReplaceAll(value, "\\", "/"))
	normalized = strings.TrimPrefix(normalized, "/")
	if normalized == "" {
		return "", nil
	}
	if !strings.HasSuffix(normalized, "/") {
		normalized += "/"
	}
	if err := ValidateFolderPrefix(normalized); err != nil {
		return "", err
	}

	return normalized, nil
}
