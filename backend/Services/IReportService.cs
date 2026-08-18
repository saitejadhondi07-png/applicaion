using Endurance.API.DTOs;

namespace Endurance.API.Services
{
    public interface IReportService
    {
        Task<ReportResponseDto> UploadReportAsync(UploadReportRequestDto request);
        Task<ReportListResponseDto> GetReportsAsync(ReportQueryDto query);
        Task<ReportDetailResponseDto?> GetReportByIdAsync(string id);
        Task<ReportDetailResponseDto?> UpdateReportStatusAsync(string id, StatusUpdateRequestDto update);
        Task<bool> DeleteReportAsync(string id);
        Task<ReportStatsResponseDto> GetStatsAsync();
        Task<byte[]> GenerateReportAsync(string id, string? filter = null);
        Task<(byte[] fileData, string fileName, string contentType)> DownloadRawFilesAsync(string id);
        Task<bool> ClearAllReportsAsync();
    }
}