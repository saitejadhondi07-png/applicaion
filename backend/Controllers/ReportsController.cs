using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using System.Collections.Generic;
using System.Threading.Tasks;
using Endurance.API.Data;
using Endurance.API.Models;
using Endurance.API.DTOs;
using Endurance.API.Services;

namespace Endurance.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class ReportsController : ControllerBase
    {
        private readonly IReportService _reportService;
        private readonly ILogger<ReportsController> _logger;

        public ReportsController(IReportService reportService, ILogger<ReportsController> logger)
        {
            _reportService = reportService;
            _logger = logger;
        }

        [HttpGet]
        [Authorize(Roles = "admin,quality_manager,quality_engineer,test_engineer")]
        public async Task<ActionResult<ReportListResponseDto>> GetReports([FromQuery] ReportQueryDto query)
        {
            try
            {
                var result = await _reportService.GetReportsAsync(query);
                return Ok(result);
            }
            catch (System.Exception ex)
            {
                _logger.LogError(ex, "GetReports failed");
                return StatusCode(500, new { message = "An error occurred while retrieving reports." });
            }
        }

        [HttpGet("{id}")]
        [Authorize(Roles = "admin,quality_manager,quality_engineer,test_engineer")]
        public async Task<ActionResult<ReportDetailResponseDto>> GetReport(string id)
        {
            if (string.IsNullOrWhiteSpace(id) || id.Contains("..") || id.Contains("/") || id.Contains("\\"))
            {
                return BadRequest(new { message = "Invalid report ID" });
            }

            var report = await _reportService.GetReportByIdAsync(id);
            if (report == null) return NotFound(new { message = "Report not found" });
            
            return Ok(report);
        }

        [HttpPost("upload")]
        [Authorize(Roles = "admin,quality_manager,quality_engineer,test_engineer")]
        [DisableRequestSizeLimit]
        [RequestFormLimits(MultipartBodyLengthLimit = 104857600, ValueLengthLimit = int.MaxValue)]
        public async Task<ActionResult<ReportResponseDto>> UploadReports(
            [FromForm] string modelNumber,
            [FromForm] string engineerId,
            [FromForm] string engineerName,
            [FromForm] List<IFormFile> files)
        {
            try
            {
                var request = new UploadReportRequestDto
                {
                    ModelNumber = modelNumber,
                    TestEngineerId = engineerId,
                    TestEngineer = engineerName,
                    Files = files
                };

                var report = await _reportService.UploadReportAsync(request);
                return CreatedAtAction(nameof(GetReport), new { id = report.Id }, report);
            }
            catch (ArgumentException ex)
            {
                _logger.LogWarning(ex, "UploadReports ArgumentException");
                return BadRequest(new { message = ex.Message });
            }
            catch (System.Exception ex)
            {
                _logger.LogError(ex, "UploadReports failed with unexpected exception");
                return StatusCode(500, new { message = "An unexpected error occurred during upload. Please try again." });
            }
        }

        [HttpPut("{id}/status")]
        [Authorize(Roles = "admin,quality_manager,quality_engineer,test_engineer")]
        public async Task<ActionResult<ReportDetailResponseDto>> UpdateStatus(string id, [FromBody] StatusUpdateRequestDto update)
        {
            if (string.IsNullOrWhiteSpace(id) || id.Contains("..") || id.Contains("/") || id.Contains("\\"))
            {
                return BadRequest(new { message = "Invalid report ID" });
            }

            var report = await _reportService.UpdateReportStatusAsync(id, update);
            if (report == null) return NotFound(new { message = "Report not found" });
            
            return Ok(report);
        }

        [HttpGet("{id}/download")]
        [Authorize(Roles = "admin,quality_manager,quality_engineer,test_engineer")]
        public async Task<IActionResult> DownloadCompiledReport(string id, [FromQuery] string? filter = null)
        {
            if (string.IsNullOrWhiteSpace(id) || id.Contains("..") || id.Contains("/") || id.Contains("\\"))
            {
                return BadRequest(new { message = "Invalid report ID" });
            }

            try
            {
                var bytes = await _reportService.GenerateReportAsync(id, filter);
                var report = await _reportService.GetReportByIdAsync(id);
                string dateStr = report?.UploadDate.ToString("yyyyMMdd") ?? DateTime.UtcNow.ToString("yyyyMMdd");
                string outputName = $"{report?.ModelNumber ?? "Report"}_Report_{dateStr}.xlsx";
                return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", outputName);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (KeyNotFoundException)
            {
                return NotFound(new { message = "Report not found" });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (System.Exception ex)
            {
                _logger.LogError(ex, "DownloadCompiledReport failed for id {Id}", id);
                return StatusCode(500, new { message = "An error occurred while generating the report." });
            }
        }

        [HttpGet("{id}/download-raw")]
        [Authorize(Roles = "admin,quality_manager,quality_engineer,test_engineer")]
        public async Task<IActionResult> DownloadRawReportFiles(string id)
        {
            if (string.IsNullOrWhiteSpace(id) || id.Contains("..") || id.Contains("/") || id.Contains("\\"))
            {
                return BadRequest(new { message = "Invalid report ID" });
            }

            try
            {
                var (fileData, fileName, contentType) = await _reportService.DownloadRawFilesAsync(id);
                return File(fileData, contentType, fileName);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (KeyNotFoundException)
            {
                return NotFound(new { message = "Report not found" });
            }
            catch (System.Exception ex)
            {
                _logger.LogError(ex, "DownloadRawReportFiles failed for id {Id}", id);
                return StatusCode(500, new { message = "An error occurred while retrieving the files." });
            }
        }

        [HttpDelete]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> ClearAllReports()
        {
            await _reportService.ClearAllReportsAsync();
            return Ok(new { message = "All reports cleared successfully" });
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "admin,quality_manager")]
        public async Task<IActionResult> DeleteReport(string id)
        {
            if (string.IsNullOrWhiteSpace(id) || id.Contains("..") || id.Contains("/") || id.Contains("\\"))
            {
                return BadRequest(new { message = "Invalid report ID" });
            }

            var deleted = await _reportService.DeleteReportAsync(id);
            if (!deleted) return NotFound(new { message = "Report not found" });

            return Ok(new { message = "Report deleted successfully" });
        }

        [HttpGet("stats")]
        [Authorize(Roles = "admin,quality_manager")]
        public async Task<ActionResult<ReportStatsResponseDto>> GetStats()
        {
            try
            {
                var stats = await _reportService.GetStatsAsync();
                return Ok(stats);
            }
            catch (System.Exception ex)
            {
                _logger.LogError(ex, "GetStats failed");
                return StatusCode(500, new { message = "An error occurred while calculating statistics." });
            }
        }
    }
}