using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Http;

namespace Endurance.API.DTOs
{
    public class ReportQueryDto
    {
        public string? Status { get; set; }
        public string? Search { get; set; }
        public int Page { get; set; } = 1;
        public int PageSize { get; set; } = 10;
    }

    public class UploadReportRequestDto
    {
        [Required]
        public string ModelNumber { get; set; } = string.Empty;
        public List<IFormFile> Files { get; set; } = new();
        public string TestEngineer { get; set; } = string.Empty;
        public string TestEngineerId { get; set; } = string.Empty;
    }

    public class ReportResponseDto
    {
        public string Id { get; set; } = string.Empty;

        /// <summary>Plant document number, e.g. "ENE5160-BTR-PP-CDC01-24F2601". Null on legacy reports.</summary>
        public string? TestReportId { get; set; }

        public string ModelNumber { get; set; } = string.Empty;
        public string TestEngineer { get; set; } = string.Empty;
        public string TestEngineerId { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public DateTime UploadDate { get; set; }
        public string? ReviewedBy { get; set; }
        public DateTime? ReviewDate { get; set; }
        public string? ApprovedBy { get; set; }
        public DateTime? ApprovalDate { get; set; }
        public string FileName { get; set; } = string.Empty;
        public string PassFailStatus { get; set; } = string.Empty;
        public List<string> FailedFiles { get; set; } = new();
    }

    public class ReportListResponseDto
    {
        public List<ReportResponseDto> Reports { get; set; } = new();
        public int TotalCount { get; set; }
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int TotalPages { get; set; }
    }

    public class StatusUpdateRequestDto
    {
        [Required]
        [RegularExpression("^(generated|reviewed|approved|rejected)$", ErrorMessage = "Invalid status")]
        public string Status { get; set; } = string.Empty;

        /// <summary>
        /// Ignored. ReportsController overwrites both from the access token before the service
        /// sees them - see ReportsController.CurrentUser. Kept on the DTO so existing clients
        /// that still post them are not rejected.
        /// </summary>
        public string UserId { get; set; } = string.Empty;

        [StringLength(100)]
        public string UserName { get; set; } = string.Empty;
    }

    public class ReportStatsResponseDto
    {
        public int TotalReports { get; set; }
        public int PassCount { get; set; }
        public int FailCount { get; set; }
        public int PendingCount { get; set; }
        public List<ModelDistributionItemDto> ModelDistribution { get; set; } = new();
        public List<UserActivityItemDto> UserActivity { get; set; } = new();
    }

    public class ModelDistributionItemDto
    {
        public string Name { get; set; } = string.Empty;
        public int Value { get; set; }
    }

    public class UserActivityItemDto
    {
        public string Name { get; set; } = string.Empty;
        public int Tested { get; set; }
        public int Reviewed { get; set; }
        public int Approved { get; set; }
    }

    public class PackRecordDto
    {
        public string BatteryPackId { get; set; } = string.Empty;
        public int IdleDeltaV { get; set; }
        public double IdleDeltaT { get; set; }
        public int DchDeltaV { get; set; }
        public double DchDeltaT { get; set; }
        public int ChDeltaV { get; set; }
        public double ChDeltaT { get; set; }
        public int ShortChDeltaV { get; set; }
        public int ShortDchDeltaV { get; set; }
        public double Soc { get; set; }
        public double Voltage { get; set; }
        public string BmsError { get; set; } = string.Empty;
        public string PulseResult { get; set; } = string.Empty;
        public string CdcResult { get; set; } = string.Empty;
        public string SocResult { get; set; } = string.Empty;
        public string OverallResult { get; set; } = string.Empty;
    }

    public class ReportDetailResponseDto
    {
        public string Id { get; set; } = string.Empty;

        /// <summary>Plant document number, e.g. "ENE5160-BTR-PP-CDC01-24F2601". Null on legacy reports.</summary>
        public string? TestReportId { get; set; }

        public string ModelNumber { get; set; } = string.Empty;
        public string TestEngineer { get; set; } = string.Empty;
        public string TestEngineerId { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public DateTime UploadDate { get; set; }
        public string? ReviewedBy { get; set; }
        public DateTime? ReviewDate { get; set; }
        public string? ApprovedBy { get; set; }
        public DateTime? ApprovalDate { get; set; }
        public string FileName { get; set; } = string.Empty;
        public string PassFailStatus { get; set; } = string.Empty;
        public List<PackRecordDto> Records { get; set; } = new();
    }
}