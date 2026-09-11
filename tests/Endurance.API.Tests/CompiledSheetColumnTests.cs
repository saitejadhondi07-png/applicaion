using Endurance.API.Configuration;
using Endurance.API.Services;
using Microsoft.Extensions.Options;
using OfficeOpenXml;
using Xunit;

namespace Endurance.API.Tests;

/// <summary>
/// Covers ProcessExcel, the path taken when an already-compiled sheet is uploaded. Its columns
/// are located by header text, and "dch_deltav" contains "ch_deltav", so a substring match for
/// the charge column silently returned the discharge column.
/// </summary>
public class CompiledSheetColumnTests
{
    private static ReportCalculator Calc() => new(Options.Create(new ThresholdConfig()));

    /// <summary>Plant column order: DCH before CH, each repeated for the Short CDC run.</summary>
    private static MemoryStream CompiledSheet()
    {
        ExcelPackage.License.SetNonCommercialOrganization("Endurance");
        var package = new ExcelPackage();
        var ws = package.Workbook.Worksheets.Add("ENE5160-BTR-PP-CDC01");

        string[] headers =
        {
            "No.", "Battery Pack ID", "Idle DeltaV", "Idle Delta_T",
            "DCH_DeltaV", "DCH_Delta_T", "CH_DeltaV", "CH_Delta_T",
            "Short CDC CH_DeltaV", "Short CDC DCH_DeltaV",
            "SoC_User(%)", "Voltage", "BMS Error",
        };
        for (int c = 0; c < headers.Length; c++) ws.Cells[1, c + 1].Value = headers[c];

        object[] row =
        {
            1, "TFA12345678A", 1, 0.3,
            10, 0.9,   // discharge
            3, 0.4,    // charge
            5, 6,
            27.0, 52.8, "NO",
        };
        for (int c = 0; c < row.Length; c++) ws.Cells[2, c + 1].Value = row[c];

        var ms = new MemoryStream();
        package.SaveAs(ms);
        ms.Position = 0;
        return ms;
    }

    [Fact]
    public void Charge_columns_are_not_read_from_the_discharge_columns()
    {
        using var sheet = CompiledSheet();

        var rec = Assert.Single(Calc().ProcessExcel(sheet, "compiled.xlsx"));

        Assert.Equal(10, rec.DchDeltaV);
        Assert.Equal(0.9, rec.DchDeltaT);
        Assert.Equal(3, rec.ChDeltaV);
        Assert.Equal(0.4, rec.ChDeltaT);
    }

    /// <summary>
    /// The mix-up was not cosmetic. Discharge holds at 11 mV and charge at 9, so reading the
    /// 10 mV discharge gap as the charge gap crossed the charge limit and failed a good pack.
    /// </summary>
    [Fact]
    public void A_pack_inside_both_limits_is_not_failed_by_the_column_mix_up()
    {
        using var sheet = CompiledSheet();

        var rec = Assert.Single(Calc().ProcessExcel(sheet, "compiled.xlsx"));

        Assert.Equal("Pass", rec.PulseResult);
        Assert.Equal("Pass", rec.OverallResult);
    }

    [Fact]
    public void Short_CDC_columns_keep_their_own_values()
    {
        using var sheet = CompiledSheet();

        var rec = Assert.Single(Calc().ProcessExcel(sheet, "compiled.xlsx"));

        Assert.Equal(5, rec.ShortChDeltaV);
        Assert.Equal(6, rec.ShortDchDeltaV);
    }
}
