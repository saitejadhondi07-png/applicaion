using System;

namespace Endurance.API.Models
{
    public class ReportFile
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string ReportId { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;
        public string ContentType { get; set; } = string.Empty;
        public byte[] FileData { get; set; } = Array.Empty<byte>();
public DateTime UploadDate { get; set; } = DateTime.UtcNow;

    // Navigation property
    public Report Report { get; set; } = null!;
}
}
