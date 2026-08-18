using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Endurance.API.Data;
using Endurance.API.Models;
using Endurance.API.DTOs;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Endurance.API.Configuration;

namespace Endurance.API.Services
{
    public class ReportService : IReportService
    {
        private readonly AppDbContext _context;
        private readonly string _templatePath;
        private readonly ILogger<ReportService> _logger;
        private readonly ReportCalculator _calculator;
        private readonly ThresholdConfig _thresholds;

        public ReportService(AppDbContext context, ILogger<ReportService> logger, ReportCalculator calculator, IOptions<ThresholdConfig> thresholds)
        {
            _context = context;
            _logger = logger;
            _calculator = calculator;
            _thresholds = thresholds.Value;
            
            _templatePath = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "template.xlsx");
            if (!File.Exists(_templatePath))
            {
                _templatePath = Path.Combine(AppContext.BaseDirectory, "template.xlsx");
            }
        }

        public async Task<ReportResponseDto> UploadReportAsync(UploadReportRequestDto request)
        {
            if (request.Files == null || request.Files.Count == 0)
                throw new ArgumentException("No files uploaded");

            if (string.IsNullOrEmpty(request.ModelNumber))
                throw new ArgumentException("Model number is required");

            // Generate unique report ID with collision check
            string reportId;
            bool idExists;
            do
            {
                reportId = $"RPT-{DateTime.UtcNow:yyyyMMddHHmmssfff}-{Guid.NewGuid().ToString("N")[..8]}";
                idExists = await _context.Reports.AnyAsync(r => r.Id == reportId);
            } while (idExists);

            var records = new List<PackRecord>();
            var fileNames = new List<string>();
            var failedFilesList = new List<string>();

            string reportStorageDir = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "PersistentStorage", "RawFiles", reportId);
            Directory.CreateDirectory(reportStorageDir);

            var savedFiles = new List<(string diskPath, string sanitizedFileName, string ext)>();
            foreach (var file in request.Files)
            {
                var sanitizedFileName = SanitizeFileName(file.FileName);
                var ext = Path.GetExtension(sanitizedFileName).ToLowerInvariant();

                if (!AllowedExtensions.Contains(ext))
                    throw new ArgumentException($"File type '{ext}' is not allowed. Allowed: {string.Join(", ", AllowedExtensions)}");

                if (sanitizedFileName.StartsWith("~$"))
                {
                    _logger.LogInformation("[UPLOAD] Skipping Excel temporary lock file: '{FileName}'", file.FileName);
                    continue;
                }

                _logger.LogInformation("[UPLOAD] Saving file to disk: '{FileName}', Length: {Length} bytes", file.FileName, file.Length);
                string diskPath = Path.Combine(reportStorageDir, sanitizedFileName);
                
                try
                {
                    using (var diskStream = new FileStream(diskPath, FileMode.Create, FileAccess.Write, FileShare.None, 81920, true))
                    {
                        using (var stream = file.OpenReadStream())
                        {
                            await stream.CopyToAsync(diskStream);
                        }
                    }
                    savedFiles.Add((diskPath, sanitizedFileName, ext));
                }
                catch (Exception exDisk)
                {
                    _logger.LogWarning(exDisk, "[UPLOAD] Could not write physical file");
                    failedFilesList.Add($"{sanitizedFileName}: Could not write file");
                }
            }

            var recordsBag = new System.Collections.Concurrent.ConcurrentBag<PackRecord>();
            var failedFilesBag = new System.Collections.Concurrent.ConcurrentBag<string>();
            var fileNamesBag = new System.Collections.Concurrent.ConcurrentBag<string>();

            Parallel.ForEach(savedFiles, fileInfo =>
            {
                var (diskPath, sanitizedFileName, ext) = fileInfo;
                byte[] magicBytes = new byte[8];
                using (var fs = new FileStream(diskPath, FileMode.Open, FileAccess.Read))
                {
                    if (fs.Length == 0)
                    {
                        failedFilesBag.Add($"{sanitizedFileName}: File is empty");
                        return;
                    }
                        
                    int bytesRead = fs.Read(magicBytes, 0, 8);
                    if (bytesRead < 8 && fs.Length >= 8) {
                        // Just to satisfy the inexact read warning implicitly
                    }
                }

                if (!ValidateFileMagicBytes(magicBytes, ext))
                {
                    failedFilesBag.Add($"{sanitizedFileName}: Invalid or corrupted file format");
                    return;
                }

                try
                {
                    if (ext == ".xlsx")
                    {
                        byte[] fileBytes = File.ReadAllBytes(diskPath);
                        using var msCopy1 = new MemoryStream(fileBytes);
                        var excelRecs = _calculator.ProcessExcel(msCopy1, sanitizedFileName);
                        if (excelRecs.Count > 0)
                        {
                            foreach (var rec in excelRecs) recordsBag.Add(rec);
                        }
                        else
                        {
                            using var msCopy2 = new MemoryStream(fileBytes);
                            var rawRec = _calculator.ProcessRawExcel(msCopy2, sanitizedFileName);
                            recordsBag.Add(rawRec);
                        }
                    }
                    else
                    {
                        var rec = _calculator.ProcessRawCsv(diskPath, sanitizedFileName);
                        recordsBag.Add(rec);
                    }
                    fileNamesBag.Add(sanitizedFileName);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "[UPLOAD] Error processing file '{FileName}'", sanitizedFileName);
                    failedFilesBag.Add($"{sanitizedFileName}: {ex.Message}");
                }
            });

            var mergedRecords = recordsBag
                .GroupBy(r => r.BatteryPackId)
                .Select(g => {
                    var merged = new PackRecord { BatteryPackId = g.Key };
                    merged.IdleDeltaV = g.Max(x => x.IdleDeltaV);
                    merged.IdleDeltaT = g.Max(x => x.IdleDeltaT);
                    merged.DchDeltaV = g.Max(x => x.DchDeltaV);
                    merged.DchDeltaT = g.Max(x => x.DchDeltaT);
                    merged.ChDeltaV = g.Max(x => x.ChDeltaV);
                    merged.ChDeltaT = g.Max(x => x.ChDeltaT);
                    merged.ShortChDeltaV = g.Max(x => x.ShortChDeltaV);
                    merged.ShortDchDeltaV = g.Max(x => x.ShortDchDeltaV);
                    merged.Soc = g.Last().Soc;
                    merged.Voltage = g.Last().Voltage;
                    
                    merged.BmsError = g.Any(x => x.BmsError == "YES") ? "YES" : 
                                     g.Any(x => x.BmsError == "CAN STUCK") ? "CAN STUCK" : "NO";
                                     
                    merged.PulseResult = g.Any(x => x.PulseResult == "Hold") ? "Hold" : "Pass";
                    merged.OverallResult = g.Any(x => x.OverallResult == "Fail") ? "Fail" : "Pass";
                    
                    return merged;
                })
                .OrderBy(r => r.BatteryPackId)
                .ToList();

            records.AddRange(mergedRecords);
            fileNames.AddRange(fileNamesBag.OrderBy(f => f));
            failedFilesList.AddRange(failedFilesBag.OrderBy(f => f));

            var rawDataObj = new { records, totalPacks = records.Count, modelNumber = request.ModelNumber };

            bool hasHolds = records.Any(r => 
                r.PulseResult == "Hold" || 
                r.OverallResult == "Hold" || 
                r.BmsError == "YES" || 
                r.BmsError == "CAN STUCK");

            string passFailStatus = hasHolds ? "fail" : "pass";

            var genData = new
            {
                records,
                generatedAt = DateTime.UtcNow,
                generatedBy = request.TestEngineer
            };

            var report = new Report
            {
                Id = reportId,
                ModelNumber = request.ModelNumber,
                TestEngineer = request.TestEngineer,
                TestEngineerId = request.TestEngineerId,
                FileName = fileNames.Count > 1 ? $"{fileNames.Count} files (e.g. {fileNames[0]})" : (fileNames.Count > 0 ? fileNames[0] : "No files"),
                Status = "generated",
                UploadDate = DateTime.UtcNow,
                RawDataJson = JsonSerializer.Serialize(rawDataObj),
                GeneratedDataJson = JsonSerializer.Serialize(genData),
                PassFailStatus = passFailStatus
            };

            _context.Reports.Add(report);
            await _context.SaveChangesAsync();

            return new ReportResponseDto
            {
                Id = report.Id,
                ModelNumber = report.ModelNumber,
                TestEngineer = report.TestEngineer,
                TestEngineerId = report.TestEngineerId,
                Status = report.Status,
                UploadDate = report.UploadDate,
                FileName = report.FileName,
                PassFailStatus = report.PassFailStatus,
                FailedFiles = failedFilesList
            };
        }

        public async Task<ReportListResponseDto> GetReportsAsync(ReportQueryDto query)
        {
            var pageSize = query.PageSize > 100 ? 100 : query.PageSize;
            var page = query.Page < 1 ? 1 : query.Page;
            
            var q = _context.Reports.AsNoTracking();

            if (!string.IsNullOrEmpty(query.Status) && !query.Status.Equals("All", StringComparison.OrdinalIgnoreCase))
            {
                q = q.Where(r => r.Status.ToLower() == query.Status.ToLower());
            }

            if (!string.IsNullOrEmpty(query.Search))
            {
                q = q.Where(r => r.ModelNumber.ToLower().Contains(query.Search.ToLower()));
            }

            int totalCount = await q.CountAsync();
            int totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);

            var list = await q
                .OrderByDescending(r => r.UploadDate)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(r => new ReportResponseDto
                {
                    Id = r.Id,
                    ModelNumber = r.ModelNumber,
                    TestEngineer = r.TestEngineer,
                    TestEngineerId = r.TestEngineerId,
                    Status = r.Status,
                    UploadDate = r.UploadDate,
                    FileName = r.FileName,
                    PassFailStatus = r.PassFailStatus
                })
                .ToListAsync();

            return new ReportListResponseDto
            {
                Reports = list,
                TotalCount = totalCount,
                Page = page,
                PageSize = pageSize,
                TotalPages = totalPages
            };
        }

        public async Task<ReportDetailResponseDto?> GetReportByIdAsync(string id)
        {
            if (string.IsNullOrWhiteSpace(id) || id.Contains("..") || id.Contains("/") || id.Contains("\\"))
                return null;

            var report = await _context.Reports.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id);
            if (report == null) return null;

            return MapToDetailDto(report);
        }

        public async Task<ReportDetailResponseDto?> UpdateReportStatusAsync(string id, StatusUpdateRequestDto update)
        {
            if (string.IsNullOrWhiteSpace(id) || id.Contains("..") || id.Contains("/") || id.Contains("\\"))
                return null;

            var report = await _context.Reports.FindAsync(id);
            if (report == null) return null;

            report.Status = update.Status.ToLower();

            if (report.Status == "reviewed")
            {
                report.ReviewedBy = update.UserName;
                report.ReviewDate = DateTime.UtcNow;
            }
            else if (report.Status == "approved")
            {
                report.ApprovedBy = update.UserName;
                report.ApprovalDate = DateTime.UtcNow;
            }

            await _context.SaveChangesAsync();
            return MapToDetailDto(report);
        }

        public async Task<bool> DeleteReportAsync(string id)
        {
            if (string.IsNullOrWhiteSpace(id) || id.Contains("..") || id.Contains("/") || id.Contains("\\"))
                return false;

            var report = await _context.Reports.FindAsync(id);
            if (report == null) return false;

            var files = _context.ReportFiles.Where(rf => rf.ReportId == id);
            _context.ReportFiles.RemoveRange(files);
            _context.Reports.Remove(report);
            await _context.SaveChangesAsync();

            try
            {
                string reportStorageDir = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "PersistentStorage", "RawFiles", id);
                if (Directory.Exists(reportStorageDir)) Directory.Delete(reportStorageDir, true);
            }
            catch { }

            return true;
        }

        public async Task<ReportStatsResponseDto> GetStatsAsync()
        {
            var reports = await _context.Reports.AsNoTracking().ToListAsync();

            int totalReports = reports.Count;
            int passCount = reports.Count(r => r.PassFailStatus == "pass");
            int failCount = reports.Count(r => r.PassFailStatus == "fail");
            int pendingCount = reports.Count(r => r.PassFailStatus == "pending");

            var modelMap = new Dictionary<string, int>();
            foreach (var r in reports)
            {
                modelMap[r.ModelNumber] = modelMap.GetValueOrDefault(r.ModelNumber, 0) + 1;
            }
            var modelDistribution = modelMap.Select(kvp => new ModelDistributionItemDto { Name = kvp.Key, Value = kvp.Value }).ToList();

            var activityMap = new Dictionary<string, UserActivityItemDto>();
            foreach (var r in reports)
            {
                if (!string.IsNullOrEmpty(r.TestEngineer))
                {
                    if (!activityMap.ContainsKey(r.TestEngineer))
                        activityMap[r.TestEngineer] = new UserActivityItemDto { Name = r.TestEngineer };
                    activityMap[r.TestEngineer].Tested += 1;
                }
                if (!string.IsNullOrEmpty(r.ReviewedBy))
                {
                    if (!activityMap.ContainsKey(r.ReviewedBy))
                        activityMap[r.ReviewedBy] = new UserActivityItemDto { Name = r.ReviewedBy };
                    activityMap[r.ReviewedBy].Reviewed += 1;
                }
                if (!string.IsNullOrEmpty(r.ApprovedBy))
                {
                    if (!activityMap.ContainsKey(r.ApprovedBy))
                        activityMap[r.ApprovedBy] = new UserActivityItemDto { Name = r.ApprovedBy };
                    activityMap[r.ApprovedBy].Approved += 1;
                }
            }
            var userActivity = activityMap.Values.ToList();

            return new ReportStatsResponseDto
            {
                TotalReports = totalReports,
                PassCount = passCount,
                FailCount = failCount,
                PendingCount = pendingCount,
                ModelDistribution = modelDistribution,
                UserActivity = userActivity
            };
        }

        public async Task<byte[]> GenerateReportAsync(string id, string? filter = null)
        {
            if (string.IsNullOrWhiteSpace(id) || id.Contains("..") || id.Contains("/") || id.Contains("\\"))
                throw new ArgumentException("Invalid report ID");

            var report = await _context.Reports.FindAsync(id);
            if (report == null) throw new KeyNotFoundException("Report not found");

            if (report.Status == "uploaded")
                throw new InvalidOperationException("Cannot download report in 'uploaded' status. Please generate it first.");

            var genData = JsonSerializer.Deserialize<JsonElement>(report.GeneratedDataJson);
            var records = new List<PackRecord>();
            if (genData.TryGetProperty("records", out var recordsElement))
            {
                records = JsonSerializer.Deserialize<List<PackRecord>>(recordsElement.GetRawText()) ?? new();
            }

            if (!string.IsNullOrEmpty(filter))
            {
                if (filter.Equals("OK", StringComparison.OrdinalIgnoreCase) || filter.Equals("Pass", StringComparison.OrdinalIgnoreCase))
                {
                    records = records.Where(r => r.OverallResult.Equals("Pass", StringComparison.OrdinalIgnoreCase) 
                        && r.PulseResult.Equals("Pass", StringComparison.OrdinalIgnoreCase) 
                        && r.BmsError.Equals("NO", StringComparison.OrdinalIgnoreCase)).ToList();
                }
                else if (filter.Equals("NG", StringComparison.OrdinalIgnoreCase) || filter.Equals("Fail", StringComparison.OrdinalIgnoreCase))
                {
                    records = records.Where(r => !r.OverallResult.Equals("Pass", StringComparison.OrdinalIgnoreCase) 
                        || !r.PulseResult.Equals("Pass", StringComparison.OrdinalIgnoreCase) 
                        || !r.BmsError.Equals("NO", StringComparison.OrdinalIgnoreCase)).ToList();
                }
            }

            return ExcelGenerator.GenerateReport(report, records, _templatePath, _thresholds);
        }

        public async Task<(byte[] fileData, string fileName, string contentType)> DownloadRawFilesAsync(string id)
        {
            if (string.IsNullOrWhiteSpace(id) || id.Contains("..") || id.Contains("/") || id.Contains("\\"))
                throw new ArgumentException("Invalid report ID");

            var report = await _context.Reports.FindAsync(id);
            if (report == null) throw new KeyNotFoundException("Report not found");

            var dbFiles = await _context.ReportFiles.Where(rf => rf.ReportId == id).ToListAsync();
            if (dbFiles.Count == 1)
            {
                var rf = dbFiles[0];
                return (rf.FileData, rf.FileName, rf.ContentType);
            }
            else if (dbFiles.Count > 1)
            {
                using var zipStream = new MemoryStream();
                using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Create, true))
                {
                    foreach (var rf in dbFiles)
                    {
                        var entry = archive.CreateEntry(rf.FileName, CompressionLevel.Fastest);
                        using var entryStream = entry.Open();
                        await entryStream.WriteAsync(rf.FileData, 0, rf.FileData.Length);
                    }
                }
                zipStream.Position = 0;
                string dateStr1 = report.UploadDate.ToString("yyyyMMdd");
                return (zipStream.ToArray(), $"{report.ModelNumber}_RawData_{dateStr1}.zip", "application/zip");
            }

            string storageDir = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "PersistentStorage", "RawFiles", id);
            if (Directory.Exists(storageDir))
            {
                var diskFiles = Directory.GetFiles(storageDir);
                if (diskFiles.Length == 1)
                {
                    byte[] bytes = await File.ReadAllBytesAsync(diskFiles[0]);
                    return (bytes, Path.GetFileName(diskFiles[0]), "application/octet-stream");
                }
                else if (diskFiles.Length > 1)
                {
                    using var zipStream = new MemoryStream();
                    using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Create, true))
                    {
                        foreach (var fPath in diskFiles)
                        {
                            var entry = archive.CreateEntry(Path.GetFileName(fPath), CompressionLevel.Fastest);
                            using var entryStream = entry.Open();
                            byte[] fBytes = await File.ReadAllBytesAsync(fPath);
                            await entryStream.WriteAsync(fBytes, 0, fBytes.Length);
                        }
                    }
                    zipStream.Position = 0;
                    string dateStr2 = report.UploadDate.ToString("yyyyMMdd");
                    return (zipStream.ToArray(), $"{report.ModelNumber}_RawData_{dateStr2}.zip", "application/zip");
                }
            }

            var rawData = JsonSerializer.Deserialize<JsonElement>(report.RawDataJson);
            var records = new List<PackRecord>();
            if (rawData.TryGetProperty("records", out var recordsElement))
            {
                records = JsonSerializer.Deserialize<List<PackRecord>>(recordsElement.GetRawText()) ?? new();
            }

            byte[] generatedRawBytes = ExcelGenerator.GenerateReport(report, records, _templatePath, _thresholds);
            return (generatedRawBytes, $"{report.ModelNumber}_RawData_{report.Id}.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        }

        public async Task<bool> ClearAllReportsAsync()
        {
            _context.Reports.RemoveRange(_context.Reports);
            _context.ReportFiles.RemoveRange(_context.ReportFiles);
            await _context.SaveChangesAsync();

            try
            {
                string rawDir = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "PersistentStorage", "RawFiles");
                if (Directory.Exists(rawDir)) Directory.Delete(rawDir, true);
            }
            catch { }

            return true;
        }

        private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase) { ".csv", ".xlsx" };
        private static readonly Dictionary<string, byte[]?> MagicBytes = new(StringComparer.OrdinalIgnoreCase)
        {
            [".xlsx"] = new byte[] { 0x50, 0x4B, 0x03, 0x04 },
            [".csv"] = null
        };

        private static string SanitizeFileName(string fileName)
        {
            if (string.IsNullOrWhiteSpace(fileName)) return "unknown";
            var sanitized = Path.GetFileName(fileName);
            var invalidChars = Path.GetInvalidFileNameChars();
            foreach (var c in invalidChars) sanitized = sanitized.Replace(c, '_');
            sanitized = sanitized.Replace("..", "_").Replace("/", "_").Replace("\\", "_");
            if (sanitized.Length > 255)
            {
                var ext = Path.GetExtension(sanitized);
                sanitized = sanitized.Substring(0, 255 - ext.Length) + ext;
            }
            return string.IsNullOrWhiteSpace(sanitized) ? $"upload_{Guid.NewGuid():N}" : sanitized;
        }

        private static bool ValidateFileMagicBytes(byte[] fileBytes, string extension)
        {
            if (!MagicBytes.TryGetValue(extension, out var expectedMagic) || expectedMagic == null)
                return true;
            if (fileBytes.Length < expectedMagic.Length) return false;
            for (int i = 0; i < expectedMagic.Length; i++)
                if (fileBytes[i] != expectedMagic[i]) return false;
            return true;
        }

        private ReportDetailResponseDto MapToDetailDto(Report r)
        {
            var dto = new ReportDetailResponseDto
            {
                Id = r.Id,
                ModelNumber = r.ModelNumber,
                TestEngineer = r.TestEngineer,
                TestEngineerId = r.TestEngineerId,
                Status = r.Status,
                UploadDate = r.UploadDate,
                ReviewedBy = r.ReviewedBy,
                ReviewDate = r.ReviewDate,
                ApprovedBy = r.ApprovedBy,
                ApprovalDate = r.ApprovalDate,
                FileName = r.FileName,
                PassFailStatus = r.PassFailStatus
            };

            if (!string.IsNullOrEmpty(r.GeneratedDataJson))
            {
                try
                {
                    var genData = JsonSerializer.Deserialize<JsonElement>(r.GeneratedDataJson);
                    if (genData.TryGetProperty("records", out var recordsElement))
                    {
                        dto.Records = JsonSerializer.Deserialize<List<PackRecordDto>>(recordsElement.GetRawText()) ?? new();
                    }
                }
                catch { }
            }

            return dto;
        }
    }
}