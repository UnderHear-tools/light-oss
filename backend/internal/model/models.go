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

type SystemStorageQuota struct {
	ID        uint64    `gorm:"primaryKey"`
	MaxBytes  uint64    `gorm:"not null"`
	CreatedAt time.Time `gorm:"not null"`
	UpdatedAt time.Time `gorm:"not null"`
}

func (SystemStorageQuota) TableName() string {
	return "system_storage_quotas"
}

type Site struct {
	ID            uint64       `gorm:"primaryKey"`
	BucketName    string       `gorm:"size:128;not null;index:idx_sites_bucket_name"`
	RootPrefix    string       `gorm:"size:512;not null"`
	Enabled       bool         `gorm:"not null;default:true"`
	IndexDocument string       `gorm:"size:255;not null"`
	ErrorDocument string       `gorm:"size:255;not null;default:''"`
	SPAFallback   bool         `gorm:"not null;default:false"`
	CreatedAt     time.Time    `gorm:"not null"`
	UpdatedAt     time.Time    `gorm:"not null"`
	Bucket        *Bucket      `json:"-" gorm:"foreignKey:BucketName;references:Name;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
	Domains       []SiteDomain `gorm:"foreignKey:SiteID"`
}

type SiteDomain struct {
	ID        uint64    `gorm:"primaryKey"`
	SiteID    uint64    `gorm:"not null;index:idx_site_domains_site_id"`
	Domain    string    `gorm:"size:255;not null;uniqueIndex:udx_site_domains_domain"`
	CreatedAt time.Time `gorm:"not null"`
	UpdatedAt time.Time `gorm:"not null"`
	Site      *Site     `json:"-" gorm:"foreignKey:SiteID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
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
	FileFingerprint  *string    `gorm:"column:file_fingerprint;size:64;index:idx_objects_bucket_fingerprint,priority:3"`
	Visibility       Visibility `gorm:"size:16;not null"`
	IsDeleted        bool       `gorm:"not null;default:false;index:idx_objects_bucket_created,priority:2;index:idx_objects_bucket_key,priority:2;index:idx_objects_bucket_fingerprint,priority:2"`
	CreatedAt        time.Time  `gorm:"not null;index:idx_objects_bucket_created,priority:3,sort:desc"`
	UpdatedAt        time.Time  `gorm:"not null"`
	Bucket           *Bucket    `json:"-" gorm:"foreignKey:BucketName;references:Name;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
}

type UploadSession struct {
	ID                    string     `gorm:"primaryKey;size:36"`
	OwnerScope            string     `gorm:"size:64;not null;index:idx_upload_sessions_owner_status,priority:1;index:idx_upload_sessions_owner_lookup,priority:1"`
	BucketName            string     `gorm:"size:128;not null;index:idx_upload_sessions_owner_lookup,priority:2"`
	ObjectKey             string     `gorm:"size:512;not null;index:idx_upload_sessions_owner_lookup,priority:3"`
	OriginalFilename      string     `gorm:"size:255;not null"`
	ContentType           string     `gorm:"size:255;not null"`
	Visibility            Visibility `gorm:"size:16;not null"`
	Size                  int64      `gorm:"not null"`
	FileFingerprint       string     `gorm:"size:64;not null;index:idx_upload_sessions_owner_lookup,priority:4"`
	Mode                  string     `gorm:"size:16;not null"`
	Status                string     `gorm:"size:32;not null;index:idx_upload_sessions_owner_status,priority:2"`
	ChunkSizeBytes        int64      `gorm:"not null"`
	TotalChunks           int        `gorm:"not null"`
	FolderUploadSessionID *string    `gorm:"size:36;index"`
	FolderEntryID         *string    `gorm:"size:36;index"`
	StagingPath           *string    `gorm:"size:512"`
	StagedSize            int64      `gorm:"not null;default:0"`
	StagedETag            *string    `gorm:"size:64"`
	ReusedObject          bool       `gorm:"not null;default:false"`
	ExpiresAt             time.Time  `gorm:"not null;index:idx_upload_sessions_expires_at"`
	CreatedAt             time.Time  `gorm:"not null"`
	UpdatedAt             time.Time  `gorm:"not null"`
}

type UploadSessionChunk struct {
	ID              uint64    `gorm:"primaryKey"`
	UploadSessionID string    `gorm:"size:36;not null;uniqueIndex:udx_upload_session_chunks_session_index,priority:1;index"`
	ChunkIndex      int       `gorm:"not null;uniqueIndex:udx_upload_session_chunks_session_index,priority:2"`
	ChunkSize       int64     `gorm:"not null"`
	ChunkSHA256     string    `gorm:"size:64;not null;index:idx_upload_session_chunks_sha"`
	Status          string    `gorm:"size:32;not null"`
	CreatedAt       time.Time `gorm:"not null"`
	UpdatedAt       time.Time `gorm:"not null"`
}

type UploadChunkBlob struct {
	SHA256      string    `gorm:"primaryKey;size:64"`
	StoragePath string    `gorm:"size:512;not null"`
	Size        int64     `gorm:"not null"`
	ExpiresAt   time.Time `gorm:"not null;index:idx_upload_chunk_blobs_expires_at"`
	CreatedAt   time.Time `gorm:"not null"`
	UpdatedAt   time.Time `gorm:"not null"`
}

type FolderUploadSession struct {
	ID               string     `gorm:"primaryKey;size:36"`
	OwnerScope       string     `gorm:"size:64;not null;index:idx_folder_upload_sessions_owner_lookup,priority:1"`
	BucketName       string     `gorm:"size:128;not null;index:idx_folder_upload_sessions_owner_lookup,priority:2"`
	Prefix           string     `gorm:"size:512;not null;index:idx_folder_upload_sessions_owner_lookup,priority:3"`
	Visibility       Visibility `gorm:"size:16;not null"`
	BatchFingerprint string     `gorm:"size:64;not null;index:idx_folder_upload_sessions_owner_lookup,priority:4"`
	Status           string     `gorm:"size:32;not null;index:idx_folder_upload_sessions_status"`
	ExpiresAt        time.Time  `gorm:"not null;index:idx_folder_upload_sessions_expires_at"`
	CreatedAt        time.Time  `gorm:"not null"`
	UpdatedAt        time.Time  `gorm:"not null"`
}

type FolderUploadEntry struct {
	ID                    string    `gorm:"primaryKey;size:36"`
	FolderUploadSessionID string    `gorm:"size:36;not null;uniqueIndex:udx_folder_upload_entries_session_path,priority:1;index"`
	RelativePath          string    `gorm:"size:512;not null;uniqueIndex:udx_folder_upload_entries_session_path,priority:2"`
	ObjectKey             string    `gorm:"size:512;not null"`
	OriginalFilename      string    `gorm:"size:255;not null"`
	ContentType           string    `gorm:"size:255;not null"`
	Size                  int64     `gorm:"not null"`
	FileFingerprint       string    `gorm:"size:64;not null"`
	Mode                  string    `gorm:"size:16;not null"`
	Status                string    `gorm:"size:32;not null"`
	UploadSessionID       *string   `gorm:"size:36;index"`
	CreatedAt             time.Time `gorm:"not null"`
	UpdatedAt             time.Time `gorm:"not null"`
}
