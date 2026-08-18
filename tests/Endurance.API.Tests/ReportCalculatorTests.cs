using System.Text;
using Endurance.API.Configuration;
using Endurance.API.Services;
using Microsoft.Extensions.Options;
using Xunit;

namespace Endurance.API.Tests;

/// <summary>
/// Pins the pass/fail behaviour of ReportCalculator, which decides whether a battery
/// pack ships. These tests assert CURRENT behaviour so that future refactors cannot
/// silently move a threshold.
/// </summary>
public class ReportCalculatorTests
{
    // Same values as appsettings.json Thresholds.
    private static ReportCalculator NewCalculator() =>
        new(Options.Create(new ThresholdConfig()));

    private static string WriteCsv(string contents)
    {
        var path = Path.Combine(Path.GetTempPath(), $"cdc_{Guid.NewGuid():N}.csv");
        File.WriteAllText(path, contents, new UTF8Encoding(false));
        return path;
    }

    private const string Header =
        "Step ID,Step State,Max_Voltage_0,Min_Voltage_0,Temperature_Cell_Max,Temperature_Cell_Min,State_Of_Charge(%),Battery_Voltage_0(V),Battery_Current,No_Error";

    /// <summary>Builds one CSV row. Voltages are in volts; the calculator converts the
    /// max/min gap to millivolts.</summary>
    private static string Row(int stepId, string state, double maxV, double minV,
                              double maxT, double minT, double soc, double volt,
                              double current, string error = "NO")
        => $"{stepId},{state},{maxV},{minV},{maxT},{minT},{soc},{volt},{current},{error}";

    [Theory]
    [InlineData("ENE5160-BTR-PP-TFA12345678A_report.xlsx", "TFA12345678A")]
    [InlineData("tfa12345678a.csv", "TFA12345678A")]
    public void ExtractBatteryPackId_finds_the_12_char_pack_id(string fileName, string expected)
    {
        Assert.Equal(expected, NewCalculator().ExtractBatteryPackId(fileName));
    }

    [Fact]
    public void A_pack_within_every_threshold_passes()
    {
        // Idle gap 3 mV / 0.5 C, discharge gap 5 mV, charge gap 4 mV, SOC 28% - all inside limits.
        var csv = string.Join("\n",
            Header,
            Row(1, "REST",         3.503, 3.500, 25.5, 25.0, 28.0, 52.8,   0),
            Row(2, "CC DISCHARGE", 3.505, 3.500, 26.0, 25.5, 28.0, 52.8, -10),
            Row(4, "CC CHARGE",    3.504, 3.500, 26.0, 25.6, 28.0, 52.8,  10));

        var path = WriteCsv(csv);
        try
        {
            var r = NewCalculator().ProcessRawCsv(path, "TFA12345678A.csv");

            Assert.Equal("TFA12345678A", r.BatteryPackId);
            Assert.Equal(3, r.IdleDeltaV);
            Assert.Equal("Pass", r.PulseResult);
            Assert.Equal("Pass", r.SocResult);
            Assert.Equal("Pass", r.OverallResult);
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public void Idle_voltage_spread_above_the_hold_limit_fails_overall()
    {
        // IdleDeltaVHold is 5 mV; 12 mV must fail.
        var csv = string.Join("\n",
            Header,
            Row(1, "REST",         3.512, 3.500, 25.2, 25.0, 28.0, 52.8,   0),
            Row(2, "CC DISCHARGE", 3.505, 3.500, 26.0, 25.5, 28.0, 52.8, -10));

        var path = WriteCsv(csv);
        try
        {
            var r = NewCalculator().ProcessRawCsv(path, "TFA12345678A.csv");

            Assert.Equal(12, r.IdleDeltaV);
            Assert.Equal("Fail", r.OverallResult);
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public void Discharge_voltage_spread_above_the_hold_limit_marks_pulse_hold_and_fails_overall()
    {
        // DchDeltaVHold is 11 mV; 20 mV must trip PulseResult to "Hold".
        var csv = string.Join("\n",
            Header,
            Row(1, "REST",         3.502, 3.500, 25.2, 25.0, 28.0, 52.8,   0),
            Row(2, "CC DISCHARGE", 3.520, 3.500, 26.0, 25.5, 28.0, 52.8, -10));

        var path = WriteCsv(csv);
        try
        {
            var r = NewCalculator().ProcessRawCsv(path, "TFA12345678A.csv");

            Assert.Equal(20, r.DchDeltaV);
            Assert.Equal("Hold", r.PulseResult);
            Assert.Equal("Fail", r.OverallResult);
        }
        finally { File.Delete(path); }
    }

    [Theory]
    [InlineData(23.9, "Fail")] // below SocMin 24.0
    [InlineData(24.0, "Pass")] // boundary is inclusive
    [InlineData(30.0, "Pass")] // boundary is inclusive
    [InlineData(30.1, "Fail")] // above SocMax 30.0
    public void Soc_is_judged_against_an_inclusive_24_to_30_window(double soc, string expected)
    {
        var csv = string.Join("\n",
            Header,
            Row(1, "REST",         3.502, 3.500, 25.2, 25.0, soc, 52.8,   0),
            Row(2, "CC DISCHARGE", 3.505, 3.500, 26.0, 25.5, soc, 52.8, -10));

        var path = WriteCsv(csv);
        try
        {
            Assert.Equal(expected, NewCalculator().ProcessRawCsv(path, "TFA12345678A.csv").SocResult);
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public void Documents_that_a_failing_Soc_does_not_by_itself_fail_the_pack()
    {
        // NOTE: this pins EXISTING behaviour, it is not an endorsement of it.
        // overallResult only considers idle deltas, pulseResult and bmsError -
        // socResult and cdcResult are reported but excluded. See ReportCalculator
        // "Formula checks". If the intent is that an out-of-range SOC should fail
        // the pack, this test is the thing that will need updating.
        var csv = string.Join("\n",
            Header,
            Row(1, "REST",         3.502, 3.500, 25.2, 25.0, 10.0, 52.8,   0),
            Row(2, "CC DISCHARGE", 3.505, 3.500, 26.0, 25.5, 10.0, 52.8, -10));

        var path = WriteCsv(csv);
        try
        {
            var r = NewCalculator().ProcessRawCsv(path, "TFA12345678A.csv");

            Assert.Equal("Fail", r.SocResult);
            Assert.Equal("Pass", r.OverallResult);
        }
        finally { File.Delete(path); }
    }
}
