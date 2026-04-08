package service

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"gorm.io/gorm"

	"light-oss/backend/internal/model"
	apperrors "light-oss/backend/internal/pkg/errors"
)

type PublishObjectSiteInput struct {
	BucketName    string
	ObjectKey     string
	Enabled       bool
	ErrorDocument string
	SPAFallback   bool
	Domains       []string
}

func (s *SitePublishService) PublishObject(
	ctx context.Context,
	input PublishObjectSiteInput,
) (*model.Site, error) {
	if err := ValidateBucketName(input.BucketName); err != nil {
		return nil, err
	}
	if err := ValidateUserObjectKey(input.ObjectKey); err != nil {
		return nil, err
	}
	if len(input.Domains) == 0 {
		return nil, apperrors.New(http.StatusBadRequest, "invalid_request", "domains is required")
	}

	if _, err := s.objectRepo.FindActive(ctx, input.BucketName, input.ObjectKey); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.New(http.StatusNotFound, "object_not_found", "object not found")
		}

		return nil, apperrors.Wrap(http.StatusInternalServerError, "object_lookup_failed", "failed to look up object", err)
	}

	rootPrefix, indexDocument := siteLocationFromObjectKey(input.ObjectKey)
	site, domains, err := s.siteService.buildSiteInput(ctx, SiteInput{
		BucketName:    input.BucketName,
		RootPrefix:    rootPrefix,
		Enabled:       input.Enabled,
		IndexDocument: indexDocument,
		ErrorDocument: input.ErrorDocument,
		SPAFallback:   input.SPAFallback,
		Domains:       input.Domains,
	})
	if err != nil {
		return nil, err
	}

	var createdSite *model.Site
	err = s.gormDB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		objectRepo := s.objectRepo.WithDB(tx)
		siteRepo := s.siteRepo.WithDB(tx)

		if _, err := objectRepo.UpdateVisibility(ctx, input.BucketName, input.ObjectKey, model.VisibilityPublic); err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return apperrors.New(http.StatusNotFound, "object_not_found", "object not found")
			}

			return apperrors.Wrap(http.StatusInternalServerError, "object_update_failed", "failed to update object visibility", err)
		}

		createdSite, err = siteRepo.Create(ctx, site, domains)
		if err != nil {
			return err
		}

		return nil
	})
	if err != nil {
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

	return createdSite, nil
}

func siteLocationFromObjectKey(objectKey string) (string, string) {
	normalized := strings.TrimSpace(strings.ReplaceAll(objectKey, "\\", "/"))
	lastSlashIndex := strings.LastIndex(normalized, "/")
	if lastSlashIndex < 0 {
		return "", normalized
	}

	return normalized[:lastSlashIndex+1], normalized[lastSlashIndex+1:]
}
