package repository

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"light-oss/backend/internal/model"
)

const systemStorageQuotaRowID uint64 = 1

type StorageQuotaRepository struct {
	db *gorm.DB
}

func NewStorageQuotaRepository(db *gorm.DB) *StorageQuotaRepository {
	return &StorageQuotaRepository{db: db}
}

func (r *StorageQuotaRepository) WithDB(db *gorm.DB) *StorageQuotaRepository {
	if db == nil {
		return r
	}

	return &StorageQuotaRepository{db: db}
}

func (r *StorageQuotaRepository) Get(ctx context.Context) (*model.SystemStorageQuota, error) {
	var quota model.SystemStorageQuota
	err := r.db.WithContext(ctx).
		Where("id = ?", systemStorageQuotaRowID).
		First(&quota).Error
	if err != nil {
		return nil, err
	}

	return &quota, nil
}

func (r *StorageQuotaRepository) EnsureDefault(
	ctx context.Context,
	defaultMaxBytes uint64,
) (*model.SystemStorageQuota, error) {
	quota, err := r.Get(ctx)
	if err == nil {
		return quota, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	now := time.Now().UTC()
	createErr := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "id"}},
			DoNothing: true,
		}).
		Create(&model.SystemStorageQuota{
			ID:        systemStorageQuotaRowID,
			MaxBytes:  defaultMaxBytes,
			CreatedAt: now,
			UpdatedAt: now,
		}).Error
	if createErr != nil {
		return nil, createErr
	}

	return r.Get(ctx)
}

func (r *StorageQuotaRepository) UpdateMaxBytes(
	ctx context.Context,
	maxBytes uint64,
) (*model.SystemStorageQuota, error) {
	now := time.Now().UTC()
	err := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "id"}},
			DoUpdates: clause.Assignments(map[string]any{
				"max_bytes":  maxBytes,
				"updated_at": now,
			}),
		}).
		Create(&model.SystemStorageQuota{
			ID:        systemStorageQuotaRowID,
			MaxBytes:  maxBytes,
			CreatedAt: now,
			UpdatedAt: now,
		}).Error
	if err != nil {
		return nil, err
	}

	return r.Get(ctx)
}
