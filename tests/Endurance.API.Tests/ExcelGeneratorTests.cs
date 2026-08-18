using System.Drawing;
using Endurance.API.Configuration;
using Endurance.API.Models;
using Endurance.API.Services;
using OfficeOpenXml;
using Xunit;

namespace Endurance.API.Tests;

public class ExcelGeneratorTests
{
    private static string TemplatePath()
    {
        // template.xlsx is copied next to the test binary via the project reference.
        var local = Path.Combine(AppContext.BaseDirectory, "template.xlsx");
        if (File.Exists(local)) return local;

        var repoRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
        return Path.Combine(repoRoot, "backend", "template.xlsx");
    }

    [Fact]
    public void Overall_Result_Fail_text_is_black()
    {
        var template = TemplatePath();
        Assert.True(File.Exists(template), $"template not found at {template}");

        var report = new Report { Id = "R1", ModelNumber = "ENE5160-BTR-PP-CDC01-DDM2601", TestEngineer = "QA" };
        var records = new List<PackRecord>
        {
            new() { BatteryPackId = "TFA12345678A", OverallResult = "Fail", Soc = 27.0 },
            new() { BatteryPackId = "TFA12345678B", OverallResult = "Pass", Soc = 27.0 },
        };

        var bytes = ExcelGenerator.GenerateReport(report, records, template, new ThresholdConfig());

        ExcelPackage.License.SetNonCommercialOrganization("Endurance");
        using var pkg = new ExcelPackage(new MemoryStream(bytes));

        var failRules = pkg.Workbook.Worksheets
            .SelectMany(w => w.ConditionalFormatting)
            .OfType<OfficeOpenXml.ConditionalFormatting.Contracts.IExcelConditionalFormattingEqual>()
            .Where(r => r.Formula == "\"Fail\"")
            .ToList();

        Assert.NotEmpty(failRules);

        var fontColor = failRules[0].Style.Font.Color.Color;
        Assert.Equal(Color.Black.ToArgb(), fontColor!.Value.ToArgb());
    }
}
