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
        private readonly string _rawFilesRoot;

        public ReportService(AppDbContext context, ILogger<ReportService> logger, ReportCalculator calculator,
                             IOptions<ThresholdConfig> thresholds, IConfiguration configuration, IWebHostEnvironment environment)
        {
            _context = context;
            _logger = logger;
            _calculator = calculator;
            _thresholds = thresholds.Value;

            // Where uploaded raw exports are kept - beside the application rather than inside
            // it, so a redeploy cannot wipe them.
            //
            // This used to be written as four levels above AppContext.BaseDirectory. That lands
            // on the repository root from bin/Debug/net10.0 - correct by accident in a dev
            // build - but from a published site it climbs out of the site entirely (C:\ for a
            // site under C:\inetpub\wwwrootpi). Anchored on the content root instead, and
            // overridable so an existing deployment can keep pointing at its current folder.
            var configuredRoot = configuration["Storage:RawFilesPath"];
            _rawFilesRoot = !string.IsNullOrWhiteSpace(configuredRoot)
                ? Path.GetFullPath(configuredRoot)
                : Path.GetFullPath(Path.Combine(environment.ContentRootPath, "..", "PersistentStorage", "RawFiles"));

            _logger.LogInformation("Raw uploaded files are stored under {RawFilesRoot}", _rawFilesRoot);

            
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

            var uploadedAtUtc = DateTime.UtcNow;

            var records = new List<PackRecord>();
            var fileNames = new List<string>();
            var failedFilesList = new List<string>();

            string reportStorageDir = Path.Combine(_rawFilesRoot, reportId);
            Directory.CreateDirectory(reportStorageDir);

            // The index is the file's position in request.Files, which is the order the
            // operator selected them - multipart preserves it, and the report is printed in it.
            var savedFiles = new List<(string diskPath, string sanitizedFileName, string ext, int order)>();
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
                    savedFiles.Add((diskPath, sanitizedFileName, ext, savedFiles.Count));
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
                var (diskPath, sanitizedFileName, ext, order) = fileInfo;
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
                    var parsed = new List<PackRecord>();
                    if (ext == ".xlsx")
                    {
                        // EPPlus holds an entire worksheet in memory - a 10 MB export expands to
                        // roughly 350 MB - so the number of workbooks alive at once, not the file
                        // size, is what decides peak memory. Unbounded, a folder of 61 exports
                        // ran the process past 5 GB. CSV parsing is cheap and stays unthrottled.
                        ExcelSlots.Wait();
                        try
                        {
                            parsed.AddRange(_calculator.ProcessExcelFile(diskPath, sanitizedFileName));
                        }
                        finally
                        {
                            ExcelSlots.Release();
                        }
                    }
                    else
                    {
                        parsed.Add(_calculator.ProcessRawCsv(diskPath, sanitizedFileName));
                    }

                    // Stamp before publishing to the bag: once a record is in there its
                    // position is gone, and this is the only place that still knows the file's
                    // place in the selection.
                    foreach (var rec in parsed)
                    {
                        rec.UploadOrder = order;
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

            // Interlock: one file, one pack. Two files claiming the same pack ID is legal - a
            // pack can be exported once per test stage - but it is also what a mis-named export
            // looks like, and the merge below folds them into a single row. Name them in the log
            // so a mismatched Summary Report can be traced back to the files that caused it.
            foreach (var clash in recordsBag
                         .GroupBy(r => r.BatteryPackId)
                         .Where(g => g.Select(x => x.SourceFile).Distinct().Count() > 1))
            {
                _logger.LogWarning(
                    "[UPLOAD] Pack {PackId} was read from {Count} files and will be merged into one row: {Files}",
                    clash.Key,
                    clash.Select(x => x.SourceFile).Distinct().Count(),
                    string.Join(" | ", clash.Select(x => x.SourceFile).Distinct().OrderBy(f => f, StringComparer.Ordinal)));
            }

            var mergedRecords = MergeByPack(recordsBag);

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

            string testReportId = await NextTestReportIdAsync(uploadedAtUtc);

            var report = new Report
            {
                Id = reportId,
                TestReportId = testReportId,
                ModelNumber = request.ModelNumber,
                TestEngineer = request.TestEngineer,
                TestEngineerId = request.TestEngineerId,
                FileName = fileNames.Count > 1 ? $"{fileNames.Count} files (e.g. {fileNames[0]})" : (fileNames.Count > 0 ? fileNames[0] : "No files"),
                Status = "generated",
                UploadDate = uploadedAtUtc,
                RawDataJson = JsonSerializer.Serialize(rawDataObj),
                GeneratedDataJson = JsonSerializer.Serialize(genData),
                PassFailStatus = passFailStatus
            };

            _context.Reports.Add(report);

            foreach (var fileInfo in savedFiles)
            {
                _context.ReportFiles.Add(new ReportFile
                {
                    ReportId = reportId,
                    FileName = fileInfo.sanitizedFileName,
                    ContentType = fileInfo.ext == ".xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv",
                    FileData = Array.Empty<byte>(),
                    UploadDate = uploadedAtUtc
                });
            }

            await _context.SaveChangesAsync();

            return new ReportResponseDto
            {
                Id = report.Id,
                TestReportId = report.TestReportId,
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
            
            var q = _context.Reports.Include(r => r.TestEngineerUser).AsNoTracking();

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
                    TestReportId = r.TestReportId,
                    ModelNumber = r.ModelNumber,
                    TestEngineer = r.TestEngineer,
                    TestEngineerId = r.TestEngineerId,
                    TestEngineerRole = r.TestEngineerUser != null ? r.TestEngineerUser.Role : string.Empty,
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
                string reportStorageDir = Path.Combine(_rawFilesRoot, id);
                if (Directory.Exists(reportStorageDir)) Directory.Delete(reportStorageDir, true);
            }
            catch { }

            return true;
        }

        public async Task<ReportStatsResponseDto> GetStatsAsync(string interval = "weekly", DateTime? startDate = null, DateTime? endDate = null)
        {
            var today = DateTime.UtcNow.Date;
            DateTime periodStart = today.AddDays(-6);
            DateTime periodEnd = today;

            if (interval.ToLower() == "custom" && startDate.HasValue && endDate.HasValue)
            {
                periodStart = startDate.Value.Date;
                periodEnd = endDate.Value.Date;
            }
            else if (interval.ToLower() == "daily")
            {
                periodStart = today;
                periodEnd = today;
            }
            else if (interval.ToLower() == "monthly")
            {
                periodStart = today.AddDays(-29);
                periodEnd = today;
            }

            var allReports = await _context.Reports.AsNoTracking().ToListAsync();
            // Filter reports strictly to the selected period
            var reports = allReports.Where(r => r.UploadDate.Date >= periodStart && r.UploadDate.Date <= periodEnd).ToList();
            
            int totalFilesUploaded = 0;
            foreach (var r in reports)
            {
                if (string.IsNullOrEmpty(r.FileName) || r.FileName == "No files") continue;
                if (r.FileName.Contains(" files (e.g."))
                {
                    if (int.TryParse(r.FileName.Split(' ')[0], out int c))
                        totalFilesUploaded += c;
                }
                else
                {
                    totalFilesUploaded += 1;
                }
            }

            int totalReports = reports.Count;
            int passCount = reports.Count(r => r.PassFailStatus == "pass");
            int failCount = reports.Count(r => r.PassFailStatus == "fail");
            int pendingCount = reports.Count(r => r.PassFailStatus == "pending");

            var modelMap = new Dictionary<string, int>();
            foreach (var r in reports)
            {
                var m = string.IsNullOrWhiteSpace(r.ModelNumber) ? "Unknown" : r.ModelNumber;
                modelMap[m] = modelMap.GetValueOrDefault(m, 0) + 1;
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

            var weeklyTrend = new List<WeeklyTrendItemDto>();

            for (var d = periodStart; d <= periodEnd; d = d.AddDays(1))
            {
                var dailyReports = reports.Where(r => r.UploadDate.Date == d).ToList();
                int dailyUploaded = 0;
                foreach (var r in dailyReports)
                {
                    if (string.IsNullOrEmpty(r.FileName) || r.FileName == "No files") continue;
                    if (r.FileName.Contains(" files (e.g."))
                    {
                        if (int.TryParse(r.FileName.Split(' ')[0], out int c))
                            dailyUploaded += c;
                    }
                    else
                    {
                        dailyUploaded += 1;
                    }
                }
                
                int dailyGenerated = dailyReports.Count;
                weeklyTrend.Add(new WeeklyTrendItemDto
                {
                    Name = interval.ToLower() == "monthly" || interval.ToLower() == "custom" ? d.ToString("dd MMM") : d.ToString("ddd"),
                    Uploaded = dailyUploaded,
                    Generated = dailyGenerated,
                    Trend = (dailyUploaded + dailyGenerated) / 2
                });
            }

            int generatedCount = reports.Count(r => r.Status != "uploaded");
            int yieldPercentage = generatedCount > 0 ? (int)Math.Round((double)passCount / generatedCount * 100) : 0;

            var last7DaysStart = today.AddDays(-7);
            var prev7DaysStart = today.AddDays(-14);

            int last7Uploads = reports.Count(r => r.UploadDate >= last7DaysStart);
            int prev7Uploads = reports.Count(r => r.UploadDate >= prev7DaysStart && r.UploadDate < last7DaysStart);
            
            int uploadGrowthPercentage = 0;
            if (prev7Uploads > 0)
            {
                uploadGrowthPercentage = (int)Math.Round(((double)last7Uploads - prev7Uploads) / prev7Uploads * 100);
            }
            else if (last7Uploads > 0)
            {
                uploadGrowthPercentage = 100;
            }

            return new ReportStatsResponseDto
            {
                TotalReports = totalReports,
                TotalFilesUploaded = totalFilesUploaded,
                PassCount = passCount,
                FailCount = failCount,
                PendingCount = pendingCount,
                UploadGrowthPercentage = uploadGrowthPercentage,
                YieldPercentage = yieldPercentage,
                ModelDistribution = modelDistribution,
                UserActivity = userActivity,
                WeeklyTrend = weeklyTrend
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
                string stem1 = TestReportNumber.FileStem(report.TestReportId ?? report.Id, report.UploadDate.ToLocalTime());
                return (zipStream.ToArray(), $"{stem1}_RawData.zip", "application/zip");
            }

            string storageDir = Path.Combine(_rawFilesRoot, id);
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
                    string stem2 = TestReportNumber.FileStem(report.TestReportId ?? report.Id, report.UploadDate.ToLocalTime());
                    return (zipStream.ToArray(), $"{stem2}_RawData.zip", "application/zip");
                }
            }

            var rawData = JsonSerializer.Deserialize<JsonElement>(report.RawDataJson);
            var records = new List<PackRecord>();
            if (rawData.TryGetProperty("records", out var recordsElement))
            {
                records = JsonSerializer.Deserialize<List<PackRecord>>(recordsElement.GetRawText()) ?? new();
            }

            byte[] generatedRawBytes = ExcelGenerator.GenerateReport(report, records, _templatePath, _thresholds);
            return (generatedRawBytes, $"{report.TestReportId ?? report.Id}_RawData.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        }

        public async Task<bool> ClearAllReportsAsync()
        {
            _context.Reports.RemoveRange(_context.Reports);
            _context.ReportFiles.RemoveRange(_context.ReportFiles);
            await _context.SaveChangesAsync();

            try
            {
                if (Directory.Exists(_rawFilesRoot)) Directory.Delete(_rawFilesRoot, true);
            }
            catch { }

            return true;
        }

        /// <summary>
        /// Allocates the next plant document number for the day <paramref name="uploadedAtUtc"/>
        /// falls on in local time. Local, not UTC: the report prints its Report Date in local
        /// time and the number has to agree with the date printed next to it.
        /// </summary>
        private async Task<string> NextTestReportIdAsync(DateTime uploadedAtUtc)
        {
            var localDate = uploadedAtUtc.ToLocalTime().Date;

            // Bound the query by the UTC instants that correspond to the local day, so SQL Server
            // can use the UploadDate index instead of converting every row.
            var fromUtc = localDate.ToUniversalTime();
            var toUtc = localDate.AddDays(1).ToUniversalTime();

            int issuedToday = await _context.Reports
                .CountAsync(r => r.UploadDate >= fromUtc && r.UploadDate < toUtc);

            var candidate = TestReportNumber.Build(localDate, issuedToday + 1);

            // ponytail: sequence derived from a count, so two uploads racing inside the same
            // second can propose the same number. Walk forward until it is free rather than
            // taking a lock - contention here is one plant, a handful of reports a day.
            int attempt = issuedToday + 1;
            while (await _context.Reports.AnyAsync(r => r.TestReportId == candidate))
            {
                attempt++;
                candidate = TestReportNumber.Build(localDate, attempt);
            }

            return candidate;
        }

        /// <summary>
        /// Collapses the per-file records into one record per battery pack. A pack can appear in
        /// several uploaded files (one per test stage), so every measurement takes the worst case
        /// and every verdict takes the worst verdict.
        /// </summary>
        public static List<PackRecord> MergeByPack(IEnumerable<PackRecord> records) =>
            records
                .GroupBy(r => r.BatteryPackId)
                .Select(g =>
                {
                    // SoC and Voltage are single readings, not gaps, so there is no "worst" to
                    // take. This used to be g.Last(), which is whatever the ConcurrentBag
                    // happened to yield first - a pack present in two files got a coin-flip
                    // SoC, and the number printed could contradict the merged verdict.
                    // Sort a failing record last so the value shown always justifies the
                    // verdict, then break ties on the filename so the pick is reproducible.
                    var postTest = g
                        .OrderBy(x => x.SocResult == "Fail" ? 1 : 0)
                        .ThenBy(x => x.SourceFile, StringComparer.Ordinal)
                        .Last();

                    return new PackRecord
                    {
                        BatteryPackId = g.Key,
                        // First time this pack appeared in the selection wins, so a pack that
                        // shows up in two files sits where the operator first listed it.
                        UploadOrder = g.Min(x => x.UploadOrder),
                        SourceFile = string.Join(", ", g.Select(x => x.SourceFile).Where(f => f.Length > 0).Distinct().OrderBy(f => f, StringComparer.Ordinal)),
                        IdleDeltaV = g.Max(x => x.IdleDeltaV),
                        IdleDeltaT = g.Max(x => x.IdleDeltaT),
                        DchDeltaV = g.Max(x => x.DchDeltaV),
                        DchDeltaT = g.Max(x => x.DchDeltaT),
                        ChDeltaV = g.Max(x => x.ChDeltaV),
                        ChDeltaT = g.Max(x => x.ChDeltaT),
                        ShortChDeltaV = g.Max(x => x.ShortChDeltaV),
                        ShortDchDeltaV = g.Max(x => x.ShortDchDeltaV),
                        Soc = postTest.Soc,
                        Voltage = postTest.Voltage,

                        BmsError = g.Any(x => x.BmsError == "YES") ? "YES"
                                 : g.Any(x => x.BmsError == "CAN STUCK") ? "CAN STUCK"
                                 : "NO",

                        // ReportCalculator reports a stuck CAN bus on PulseResult (rewriting BmsError
                        // to "YES" at the same time), so it has to be carried through here or a
                        // stuck-CAN pack merges down to a plain "Pass".
                        PulseResult = g.Any(x => x.PulseResult == "CAN STUCK") ? "CAN STUCK"
                                    : g.Any(x => x.PulseResult == "Hold") ? "Hold"
                                    : "Pass",

                        // These two were previously never assigned, so they fell back to the "Pass"
                        // default on PackRecord and every report showed the SoC and Short-CDC checks
                        // as passing no matter what the calculator scored.
                        CdcResult = g.Any(x => x.CdcResult == "Fail") ? "Fail" : "Pass",
                        SocResult = g.Any(x => x.SocResult == "Fail") ? "Fail" : "Pass",

                        OverallResult = g.Any(x => x.OverallResult == "Fail") ? "Fail" : "Pass",
                    };
                })
                // Printed in the order the operator selected the files, NOT alphabetically by
                // pack ID. The plant reads the report against the list of files they picked,
                // so an alphabetical sort put every pack at a row they did not expect - which
                // reads as "this pack ID has a different pack's data" even though each row is
                // internally correct. ThenBy keeps the old behaviour for records written
                // before UploadOrder existed, where every value is 0.
                .OrderBy(r => r.UploadOrder)
                .ThenBy(r => r.BatteryPackId, StringComparer.Ordinal)
                .ToList();

        /// <summary>
        /// Caps how many workbooks are parsed at once, across every in-flight upload. Static on
        /// purpose: two operators uploading at the same time must share the budget, or the cap
        /// buys nothing. Three is a deliberate floor-plant compromise - enough to keep the
        /// cores busy, few enough that peak stays near a gigabyte rather than five.
        /// ponytail: fixed cap, make it a setting if the server's memory ever changes.
        /// </summary>
        private static readonly SemaphoreSlim ExcelSlots =
            new(Math.Max(1, Math.Min(Environment.ProcessorCount, 3)));

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
            // Only "/" and "\\" are stripped here. A ".." collapse used to sit alongside them
            // and rewrote every double dot to "_", so an export named "...Record Layer..csv"
            // arrived with no extension at all and was rejected as "File type '' is not
            // allowed" - taking the whole batch down with it. It protected nothing:
            // Path.GetFileName above has already removed any directory part, so an interior
            // ".." cannot traverse. Only a name made entirely of dots resolves to a directory.
            sanitized = sanitized.Replace("/", "_").Replace("\\", "_");
            if (sanitized.Trim('.').Length == 0) sanitized = "unknown";
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
                TestReportId = r.TestReportId,
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