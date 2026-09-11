using Endurance.API.Configuration;
using Endurance.API.Services;
using Microsoft.Extensions.Options;
using Xunit;

namespace Endurance.API.Tests;

/// <summary>
/// Covers which column the SoC verdict is taken from, and what happens when it cannot
/// be read. Regression cover for the field report that the software was scoring against
/// "State of Charge (Real SoC)" instead of the operator-entered "User SoC".
/// </summary>
public class SocColumnTests
{
    private static ReportCalculator Calc() => new(Options.Create(new ThresholdConfig()));

    private static string Csv(params string[] lines)
    {
        var p = Path.Combine(Path.GetTempPath(), $"soc_{Guid.NewGuid():N}.csv");
        File.WriteAllText(p, string.Join("\n", lines));
        return p;
    }

    private const string Both =
        "Step ID,Step State,Max_Voltage_0,Min_Voltage_0,Temperature_Cell_Max,Temperature_Cell_Min,State of Charge (Real SoC),User SoC,Battery_Voltage_0(V),Battery_Current,No_Error";

    // Same columns, but User SoC placed FIRST - the old code's answer depended on this order.
    private const string BothReversed =
        "Step ID,Step State,Max_Voltage_0,Min_Voltage_0,Temperature_Cell_Max,Temperature_Cell_Min,User SoC,State of Charge (Real SoC),Battery_Voltage_0(V),Battery_Current,No_Error";

    private const string RealOnly =
        "Step ID,Step State,Max_Voltage_0,Min_Voltage_0,Temperature_Cell_Max,Temperature_Cell_Min,State_Of_Charge(%),Battery_Voltage_0(V),Battery_Current,No_Error";

    private const string NoSoc =
        "Step ID,Step State,Max_Voltage_0,Min_Voltage_0,Temperature_Cell_Max,Temperature_Cell_Min,Battery_Voltage_0(V),Battery_Current,No_Error";

    [Fact]
    public void User_SoC_wins_over_Real_SoC_when_Real_SoC_comes_first()
    {
        var p = Csv(Both,
            "1,REST,3.502,3.500,25.2,25.0,12.5,27.0,52.8,0,0",
            "2,CC DISCHARGE,3.505,3.500,26.0,25.5,12.5,27.0,52.8,-10,0");
        try
        {
            var r = Calc().ProcessRawCsv(p, "TFA12345678A.csv");
            Assert.Equal(27.0, r.Soc);
            Assert.Equal("Pass", r.SocResult);
        }
        finally { File.Delete(p); }
    }

    [Fact]
    public void User_SoC_wins_regardless_of_column_order()
    {
        var p = Csv(BothReversed,
            "1,REST,3.502,3.500,25.2,25.0,27.0,12.5,52.8,0,0",
            "2,CC DISCHARGE,3.505,3.500,26.0,25.5,27.0,12.5,52.8,-10,0");
        try
        {
            Assert.Equal(27.0, Calc().ProcessRawCsv(p, "TFA12345678A.csv").Soc);
        }
        finally { File.Delete(p); }
    }

    [Fact]
    public void Falls_back_to_Real_SoC_only_when_User_SoC_is_absent()
    {
        var p = Csv(RealOnly,
            "1,REST,3.502,3.500,25.2,25.0,26.5,52.8,0,0",
            "2,CC DISCHARGE,3.505,3.500,26.0,25.5,26.5,52.8,-10,0");
        try
        {
            Assert.Equal(26.5, Calc().ProcessRawCsv(p, "TFA12345678A.csv").Soc);
        }
        finally { File.Delete(p); }
    }

    [Fact]
    public void A_file_with_no_SoC_column_is_rejected_by_name()
    {
        var p = Csv(NoSoc,
            "1,REST,3.502,3.500,25.2,25.0,52.8,0,0",
            "2,CC DISCHARGE,3.505,3.500,26.0,25.5,52.8,-10,0");
        try
        {
            var ex = Assert.Throws<InvalidOperationException>(
                () => Calc().ProcessRawCsv(p, "TFA12345678A.csv"));
            Assert.Contains("TFA12345678A", ex.Message);
            Assert.Contains("SoC", ex.Message);
        }
        finally { File.Delete(p); }
    }

    [Fact]
    public void A_truncated_final_row_is_rejected_instead_of_reporting_29_87()
    {
        // Previously this returned Soc = 29.87 (healthy-looking) with SocResult = "Fail".
        var p = Csv(RealOnly,
            "1,REST,3.502,3.500,25.2,25.0,27.0,52.8,0,0",
            "2,CC DISCHARGE,3.505,3.500,26.0,25.5");
        try
        {
            var ex = Assert.Throws<InvalidOperationException>(
                () => Calc().ProcessRawCsv(p, "TFA12345678A.csv"));
            Assert.Contains("TFA12345678A", ex.Message);
        }
        finally { File.Delete(p); }
    }

    [Fact]
    public void A_genuinely_zero_SoC_is_reported_as_zero_not_masked()
    {
        var p = Csv(RealOnly,
            "1,REST,3.502,3.500,25.2,25.0,0,52.8,0,0",
            "2,CC DISCHARGE,3.505,3.500,26.0,25.5,0,52.8,-10,0");
        try
        {
            var r = Calc().ProcessRawCsv(p, "TFA12345678A.csv");
            Assert.Equal(0, r.Soc);          // was silently reported as 29.87
            Assert.Equal("Fail", r.SocResult);
        }
        finally { File.Delete(p); }
    }

    // The BTS exports name the operator column "SoC_User(%)", noun first. The original
    // patterns only matched "user soc", so real files fell through to Real SoC. On pack
    // THA163301E58 (report RPT-20260831105107826) that read 0.000 instead of 29.63 and
    // still printed Pass.
    private const string RealExportHeaders =
        "Cycle ID,Step ID,Step State,Max_Voltage_0(V),Min_Voltage_0(V),Temperature_Cell_Max(C),Temperature_Cell_Min(C),SoC_User(%),State_of_Charge(%),Battery_Voltage_0(V),Battery_Current(A),NO_ERROR";

    [Fact]
    public void SoC_User_header_from_the_real_export_beats_State_of_Charge()
    {
        var p = Csv(RealExportHeaders,
            "3,1,Still,3.502,3.500,25.2,25.0,29.630,0.000,52.913,0,0",
            "3,9,Still,3.502,3.500,25.2,25.0,29.630,0.000,52.913,0,0");
        try
        {
            var r = Calc().ProcessRawCsv(p, "TFA12345678A.csv");
            Assert.Equal(29.63, r.Soc);      // not 0.000 from State_of_Charge
            Assert.Equal("Pass", r.SocResult);
        }
        finally { File.Delete(p); }
    }

    [Theory]
    [InlineData("SoC_User(%)")]
    [InlineData("SoC User (%)")]
    [InlineData("User SoC")]
    [InlineData("User_SoC(%)")]
    public void Both_naming_orders_are_recognised_as_User_SoC(string userSocHeader)
    {
        var p = Csv(
            $"Step ID,Step State,Max_Voltage_0,Min_Voltage_0,Temperature_Cell_Max,Temperature_Cell_Min,{userSocHeader},State_of_Charge(%),Battery_Voltage_0(V),Battery_Current,No_Error",
            "1,REST,3.502,3.500,25.2,25.0,27.5,0.000,52.8,0,0",
            "2,CC DISCHARGE,3.505,3.500,26.0,25.5,27.5,0.000,52.8,-10,0");
        try
        {
            Assert.Equal(27.5, Calc().ProcessRawCsv(p, "TFA12345678A.csv").Soc);
        }
        finally { File.Delete(p); }
    }
}
