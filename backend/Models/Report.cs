using System;
using System.Collections.Generic;

namespace Endurance.API.Models
{
    public class Report
    {
        public string Id { get; set; } = string.Empty;

        /// <summary>
        /// The plant's controlled document number, e.g. "ENE5160-BTR-PP-CDC01-24F2601".
        /// This is what the "Test Report ID" cell of the report prints, and what the
        /// downloaded file is named after. It is deliberately separate from <see cref="Id"/>,
        /// which is the internal database key and raw-file storage directory.
        /// Null on reports created before this field existed; callers fall back to Id.
        /// </summary>
        public string? TestReportId { get; set; }

        public string ModelNumber { get; set; } = string.Empty;
        public string TestEngineer { get; set; } = string.Empty;
        public string TestEngineerId { get; set; } = string.Empty;
        public string Status { get; set; } = "uploaded"; // uploaded, generated, reviewed, approved, rejected
        public DateTime UploadDate { get; set; } = DateTime.UtcNow;
        public string? ReviewedBy { get; set; }
        public DateTime? ReviewDate { get; set; }
        public string? ApprovedBy { get; set; }
        public DateTime? ApprovalDate { get; set; }
        public string FileName { get; set; } = string.Empty;
        
        // JSON serialized strings for SQlite compatibility
        public string RawDataJson { get; set; } = "{}";
        public string GeneratedDataJson { get; set; } = "{}";
        
public string PassFailStatus { get; set; } = "pending"; // pass, fail, pending

    // Navigation properties
    public User TestEngineerUser { get; set; } = null!;
    public ICollection<ReportFile> ReportFiles { get; set; } = new List<ReportFile>();
}

    public class PackRecord
    {
        public string BatteryPackId { get; set; } = string.Empty;

        /// <summary>
        /// The uploaded file this record was read from. Files are parsed in parallel into a
        /// ConcurrentBag, so arrival order is not reproducible; the per-pack merge orders by
        /// this instead. Also names the files when two of them claim the same pack.
        /// Empty on reports generated before this field existed.
        /// </summary>
        public string SourceFile { get; set; } = string.Empty;

        /// <summary>
        /// Zero-based position of <see cref="SourceFile"/> in the operator's file selection.
        /// The report prints packs in this order, because the plant reads it against the list
        /// of files they picked. Files are parsed in parallel into a ConcurrentBag, so the
        /// selection order cannot be recovered afterwards - it has to be carried.
        /// Defaults to 0 on records written before this field existed, which leaves those
        /// reports in their original pack-ID order.
        /// </summary>
        public int UploadOrder { get; set; }
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
        public string BmsError { get; set; } = "NO";
        public string PulseResult { get; set; } = "Pass";
        public string CdcResult { get; set; } = "Pass";
        public string SocResult { get; set; } = "Pass";
        public string OverallResult { get; set; } = "Pass";
    }

    public class ReportStats
    {
        public int TotalReports { get; set; }
        public int TotalFilesUploaded { get; set; }
        public int PassCount { get; set; }
        public int FailCount { get; set; }
        public int PendingCount { get; set; }
        public List<ModelDistributionItem> ModelDistribution { get; set; } = new();
        public List<UserActivityItem> UserActivity { get; set; } = new();
    }

    public class ModelDistributionItem
    {
        public string Name { get; set; } = string.Empty;
        public int Value { get; set; }
    }

    public class UserActivityItem
    {
        public string Name { get; set; } = string.Empty;
        public int Tested { get; set; }
        public int Reviewed { get; set; }
        public int Approved { get; set; }
    }
}
