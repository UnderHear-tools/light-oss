package model

import "time"

type Visibility string

const (
	VisibilityPublic  Visibility = "public"
	VisibilityPrivate Visibility = "private"
)

type Bucket struct {
	ID        uint64    `gorm:"primaryKey"`
	Name      string    `gorm:"size:128;uniqueIndex;not null"`
	CreatedAt time.Time `gorm:"not null"`
	UpdatedAt time.Time `gorm:"not null"`
}

type Object struct {
	ID               uint64     `gorm:"primaryKey"`
	BucketName       string     `gorm:"size:128;not null;uniqueIndex:udx_objects_bucket_key,priority:1;index:idx_objects_bucket_created,priority:1;index:idx_objects_bucket_key,priority:1"`
	ObjectKey        string     `gorm:"size:512;not null;uniqueIndex:udx_objects_bucket_key,priority:2;index:idx_objects_bucket_key,priority:3"`
	OriginalFilename string     `gorm:"size:255;not null"`
	StoragePath      string     `gorm:"size:512;not null"`
	Size             int64      `gorm:"not null"`
	ContentType      string     `gorm:"size:255;not null"`
	ETag             string     `gorm:"column:etag;size:64;not null"`
	Visibility       Visibility `gorm:"size:16;not null"`
	IsDeleted        bool       `gorm:"not null;default:false;index:idx_objects_bucket_created,priority:2;index:idx_objects_bucket_key,priority:2"`
	CreatedAt        time.Time  `gorm:"not null;index:idx_objects_bucket_created,priority:3,sort:desc"`
	UpdatedAt        time.Time  `gorm:"not null"`
}
