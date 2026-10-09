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

        /// <summary>
        /// The signed-in user, read from the access token.
        ///
        /// Every name this controller stores on a report is taken from here and never from the
        /// request. "Tested By", "Reviewed By" and "Approved By" are printed in the signature
        /// block of a controlled document, and they used to be whatever strings the browser
        /// posted - so a report could be approved under someone else's name.
        /// </summary>
        private (string Id, string Name, string Role) CurrentUser()
        {
            string id = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                     ?? User.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)?.Value
                     ?? string.Empty;
            string name = User.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Name)?.Value
                       ?? User.Identity?.Name
                       ?? id;
            string role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value ?? string.Empty;
            return (id, name, role);
        }

        /// <summary>
        /// Who may move a report into a given state. Segregation of duties is the point of the
        /// upload -> review -> approve workflow, and the endpoint used to accept any status
        /// from any role, so a test engineer could approve their own report.
        /// </summary>
        private static readonly Dictionary<string, string[]> StatusRoles = new(StringComparer.OrdinalIgnoreCase)
        {
            ["generated"] = new[] { "admin", "quality_manager", "quality_engineer", "test_engineer" },
            ["reviewed"]  = new[] { "admin", "quality_engineer", "quality_manager" },
            ["rejected"]  = new[] { "admin", "quality_engineer", "quality_manager" },
            ["approved"]  = new[] { "admin", "quality_manager" },
        };

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
                // engineerId/engineerName still arrive on the form for backwards compatibility
                // with older frontends, and are deliberately ignored: the tester recorded on the
                // report is the signed-in user.
                var me = CurrentUser();
                var request = new UploadReportRequestDto
                {
                    ModelNumber = modelNumber,
                    TestEngineerId = me.Id,
                    TestEngineer = me.Name,
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

            var me = CurrentUser();
            if (!StatusRoles.TryGetValue(update.Status ?? string.Empty, out var permitted))
            {
                return BadRequest(new { message = "Invalid status" });
            }
            if (!permitted.Contains(me.Role, StringComparer.OrdinalIgnoreCase))
            {
                _logger.LogWarning("User {UserId} with role {Role} tried to set report {ReportId} to {Status}",
                    me.Id, me.Role, id, update.Status);
                return StatusCode(403, new { message = $"Your role may not set a report to '{update.Status}'." });
            }

            // Overwrite whatever the browser claimed. The signature block is only meaningful if
            // the name on it is the person who actually signed in.
            update.UserId = me.Id;
            update.UserName = me.Name;

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
                // Named the way the plant names them: document number, then the report date,
                // e.g. "ENE5160-BTR-PP-CDC01-24F2601_24_Jun_2026.xlsx". Falls back to the
                // internal id for reports created before document numbers existed.
                var reportDate = (report?.UploadDate ?? DateTime.UtcNow).ToLocalTime();
                string docNumber = report?.TestReportId ?? report?.Id ?? "Report";
                string outputName = $"{Endurance.API.Services.TestReportNumber.FileStem(docNumber, reportDate)}.xlsx";
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
        [Authorize(Roles = "admin,quality_manager,quality_engineer,test_engineer")]
        public async Task<ActionResult<ReportStatsResponseDto>> GetStats([FromQuery] string interval = "weekly", [FromQuery] DateTime? startDate = null, [FromQuery] DateTime? endDate = null)
        {
            try
            {
                var stats = await _reportService.GetStatsAsync(interval, startDate, endDate);
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