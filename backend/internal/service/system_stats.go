package service

import (
	"context"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/mem"
	"go.uber.org/zap"

	apperrors "light-oss/backend/internal/pkg/errors"
)

type SystemStatsService struct {
	logger            *zap.Logger
	storageRoot       string
	cpuSampleInterval time.Duration
	storageUsageTTL   time.Duration
	now               func() time.Time

	storageUsageMu         sync.Mutex
	cachedStorageRoot      string
	cachedStorageUsedBytes uint64
	cachedStorageAt        time.Time
}

type SystemStats struct {
	OS      string
	CPU     SystemCPUStats
	Memory  SystemMemoryStats
	Disks   []SystemDiskStats
	Storage SystemStorageStats
}

type SystemCPUStats struct {
	UsedPercent float64
}

type SystemMemoryStats struct {
	TotalBytes     uint64
	UsedBytes      uint64
	AvailableBytes uint64
	UsedPercent    float64
}

type SystemDiskStats struct {
	Label               string
	MountPoint          string
	Filesystem          string
	TotalBytes          uint64
	UsedBytes           uint64
	FreeBytes           uint64
	UsedPercent         float64
	ContainsStorageRoot bool
}

type SystemStorageStats struct {
	RootPath  string
	UsedBytes uint64
}

type diskSnapshot struct {
	label               string
	mountPoint          string
	filesystem          string
	totalBytes          uint64
	usedBytes           uint64
	freeBytes           uint64
	usedPct             float64
	containsStorageRoot bool
}

func NewSystemStatsService(logger *zap.Logger, storageRoot string) *SystemStatsService {
	return &SystemStatsService{
		logger:            logger,
		storageRoot:       storageRoot,
		cpuSampleInterval: 200 * time.Millisecond,
		storageUsageTTL:   time.Minute,
		now:               time.Now,
	}
}

func (s *SystemStatsService) Collect(ctx context.Context) (*SystemStats, error) {
	cpuPercentages, err := cpu.PercentWithContext(ctx, s.cpuSampleInterval, false)
	if err != nil {
		return nil, apperrors.Wrap(http.StatusInternalServerError, "system_metrics_unavailable", "failed to collect system metrics", err)
	}
	if len(cpuPercentages) == 0 {
		return nil, apperrors.New(http.StatusInternalServerError, "system_metrics_unavailable", "failed to collect system metrics")
	}

	virtualMemory, err := mem.VirtualMemoryWithContext(ctx)
	if err != nil {
		return nil, apperrors.Wrap(http.StatusInternalServerError, "system_metrics_unavailable", "failed to collect system metrics", err)
	}

	absStorageRoot, err := filepath.Abs(s.storageRoot)
	if err != nil {
		return nil, apperrors.Wrap(http.StatusInternalServerError, "system_metrics_unavailable", "failed to collect system metrics", err)
	}

	storageUsedBytes, err := s.storageUsage(absStorageRoot)
	if err != nil {
		return nil, apperrors.Wrap(http.StatusInternalServerError, "system_metrics_unavailable", "failed to collect system metrics", err)
	}

	partitions, err := disk.PartitionsWithContext(ctx, true)
	if err != nil {
		return nil, apperrors.Wrap(http.StatusInternalServerError, "system_metrics_unavailable", "failed to collect system metrics", err)
	}

	disks := make([]diskSnapshot, 0, len(partitions))
	for _, partition := range dedupePartitions(partitions) {
		usage, err := disk.UsageWithContext(ctx, partition.Mountpoint)
		if err != nil {
			s.logger.Warn("collect disk usage failed", zap.String("mount_point", partition.Mountpoint), zap.Error(err))
			continue
		}
		if usage.Total == 0 {
			continue
		}

		disks = append(disks, diskSnapshot{
			label:      diskLabel(partition),
			mountPoint: canonicalMountPoint(partition.Mountpoint),
			filesystem: partition.Fstype,
			totalBytes: usage.Total,
			usedBytes:  usage.Used,
			freeBytes:  usage.Free,
			usedPct:    usage.UsedPercent,
		})
	}

	markStorageRootDisk(absStorageRoot, disks)
	sortDiskSnapshots(disks)

	resultDisks := make([]SystemDiskStats, 0, len(disks))
	for _, item := range disks {
		resultDisks = append(resultDisks, SystemDiskStats{
			Label:               item.label,
			MountPoint:          item.mountPoint,
			Filesystem:          item.filesystem,
			TotalBytes:          item.totalBytes,
			UsedBytes:           item.usedBytes,
			FreeBytes:           item.freeBytes,
			UsedPercent:         item.usedPct,
			ContainsStorageRoot: item.containsStorageRoot,
		})
	}

	return &SystemStats{
		OS: mapRuntimeOS(runtime.GOOS),
		CPU: SystemCPUStats{
			UsedPercent: cpuPercentages[0],
		},
		Memory: SystemMemoryStats{
			TotalBytes:     virtualMemory.Total,
			UsedBytes:      virtualMemory.Used,
			AvailableBytes: virtualMemory.Available,
			UsedPercent:    virtualMemory.UsedPercent,
		},
		Disks: resultDisks,
		Storage: SystemStorageStats{
			RootPath:  absStorageRoot,
			UsedBytes: storageUsedBytes,
		},
	}, nil
}

func mapRuntimeOS(goos string) string {
	switch goos {
	case "windows":
		return "windows"
	case "linux":
		return "linux"
	case "darwin":
		return "macos"
	default:
		return "other"
	}
}

func directorySize(root string) (uint64, error) {
	var total uint64

	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}

		info, err := d.Info()
		if err != nil {
			return err
		}
		if info.Size() < 0 {
			return nil
		}

		total += uint64(info.Size())
		return nil
	})
	if err != nil {
		return 0, err
	}

	return total, nil
}

func (s *SystemStatsService) storageUsage(absStorageRoot string) (uint64, error) {
	s.storageUsageMu.Lock()
	defer s.storageUsageMu.Unlock()

	now := s.now()
	if s.cachedStorageRoot == absStorageRoot &&
		!s.cachedStorageAt.IsZero() &&
		now.Sub(s.cachedStorageAt) < s.storageUsageTTL {
		return s.cachedStorageUsedBytes, nil
	}

	usedBytes, err := directorySize(absStorageRoot)
	if err != nil {
		return 0, err
	}

	s.cachedStorageRoot = absStorageRoot
	s.cachedStorageUsedBytes = usedBytes
	s.cachedStorageAt = now

	return usedBytes, nil
}

func dedupePartitions(partitions []disk.PartitionStat) []disk.PartitionStat {
	seen := make(map[string]struct{}, len(partitions))
	result := make([]disk.PartitionStat, 0, len(partitions))

	for _, partition := range partitions {
		mountPoint := strings.TrimSpace(partition.Mountpoint)
		if mountPoint == "" {
			continue
		}

		key := normalizedPathForComparison(canonicalMountPoint(mountPoint))
		if _, ok := seen[key]; ok {
			continue
		}

		seen[key] = struct{}{}
		result = append(result, partition)
	}

	return result
}

func diskLabel(partition disk.PartitionStat) string {
	if volumeName := filepath.VolumeName(partition.Mountpoint); volumeName != "" {
		return volumeName
	}
	if strings.TrimSpace(partition.Device) != "" {
		return partition.Device
	}

	return partition.Mountpoint
}

func markStorageRootDisk(storageRoot string, disks []diskSnapshot) {
	bestIndex := -1
	bestLength := -1

	for index := range disks {
		if !pathWithinMountPoint(storageRoot, disks[index].mountPoint) {
			continue
		}

		length := len(normalizedPathForComparison(disks[index].mountPoint))
		if length > bestLength {
			bestIndex = index
			bestLength = length
		}
	}

	if bestIndex >= 0 {
		disks[bestIndex].containsStorageRoot = true
	}
}

func pathWithinMountPoint(targetPath string, mountPoint string) bool {
	relativePath, err := filepath.Rel(
		canonicalMountPoint(mountPoint),
		filepath.Clean(targetPath),
	)
	if err != nil {
		return false
	}

	return relativePath == "." || (relativePath != ".." && !strings.HasPrefix(relativePath, ".."+string(os.PathSeparator)))
}

func sortDiskSnapshots(disks []diskSnapshot) {
	sort.Slice(disks, func(i int, j int) bool {
		if disks[i].containsStorageRoot != disks[j].containsStorageRoot {
			return disks[i].containsStorageRoot
		}

		leftLabel := strings.ToLower(disks[i].label)
		rightLabel := strings.ToLower(disks[j].label)
		if leftLabel != rightLabel {
			return leftLabel < rightLabel
		}

		return strings.ToLower(disks[i].mountPoint) < strings.ToLower(disks[j].mountPoint)
	})
}

func normalizedPathForComparison(path string) string {
	cleaned := filepath.Clean(canonicalMountPoint(path))
	if runtime.GOOS == "windows" {
		return strings.ToLower(cleaned)
	}

	return cleaned
}

func canonicalMountPoint(path string) string {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return ""
	}
	if runtime.GOOS != "windows" {
		return filepath.Clean(trimmed)
	}

	volumeName := filepath.VolumeName(trimmed)
	if volumeName != "" && strings.EqualFold(volumeName, trimmed) {
		return volumeName + `\`
	}

	return filepath.Clean(trimmed)
}
