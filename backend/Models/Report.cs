using System;
using System.Collections.Generic;

namespace Endurance.API.Models
{
    public class Report
    {
        public string Id { get; set; } = string.Empty;
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
