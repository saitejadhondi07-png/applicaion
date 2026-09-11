using Endurance.API.Models;
using Endurance.API.Services;
using Xunit;

namespace Endurance.API.Tests;

/// <summary>
/// Covers the per-pack merge that runs after every upload. It rebuilds each PackRecord from
/// scratch, so any verdict it forgets to copy silently reverts to the "Pass" default on
/// PackRecord. That is what shipped SoC and Short-CDC as "Pass" on every report ever generated.
/// </summary>
public class MergeByPackTests
{
    private static PackRecord Rec(string id = "THA163301E58") => new() { BatteryPackId = id };

    [Fact]
    public void Failed_SoC_survives_the_merge()
    {
        var r = Rec();
        r.Soc = 0;
        r.SocResult = "Fail";

        var merged = Assert.Single(ReportService.MergeByPack(new[] { r }));

        Assert.Equal("Fail", merged.SocResult);
    }

    [Fact]
    public void Failed_Short_CDC_survives_the_merge()
    {
        var r = Rec();
        r.ShortChDeltaV = 31;
        r.ShortDchDeltaV = 30;
        r.CdcResult = "Fail";

        var merged = Assert.Single(ReportService.MergeByPack(new[] { r }));

        Assert.Equal("Fail", merged.CdcResult);
        Assert.Equal(31, merged.ShortChDeltaV);
        Assert.Equal(30, merged.ShortDchDeltaV);
    }

    [Fact]
    public void Can_stuck_is_not_downgraded_to_Pass()
    {
        // ReportCalculator emits CAN STUCK on PulseResult and sets BmsError to YES.
        var r = Rec();
        r.PulseResult = "CAN STUCK";
        r.BmsError = "YES";
        r.OverallResult = "Fail";

        var merged = Assert.Single(ReportService.MergeByPack(new[] { r }));

        Assert.Equal("CAN STUCK", merged.PulseResult);
        Assert.Equal("Fail", merged.OverallResult);
    }

    [Fact]
    public void Worst_case_wins_when_one_pack_spans_several_files()
    {
        var clean = Rec();
        clean.IdleDeltaV = 2;
        clean.ShortChDeltaV = 5;

        var bad = Rec();
        bad.IdleDeltaV = 7;
        bad.ShortChDeltaV = 31;
        bad.CdcResult = "Fail";
        bad.SocResult = "Fail";
        bad.PulseResult = "Hold";
        bad.OverallResult = "Fail";

        var merged = Assert.Single(ReportService.MergeByPack(new[] { clean, bad }));

        Assert.Equal(7, merged.IdleDeltaV);
        Assert.Equal(31, merged.ShortChDeltaV);
        Assert.Equal("Fail", merged.CdcResult);
        Assert.Equal("Fail", merged.SocResult);
        Assert.Equal("Hold", merged.PulseResult);
        Assert.Equal("Fail", merged.OverallResult);
    }

    [Fact]
    public void A_clean_pack_still_passes()
    {
        var merged = Assert.Single(ReportService.MergeByPack(new[] { Rec() }));

        Assert.Equal("Pass", merged.SocResult);
        Assert.Equal("Pass", merged.CdcResult);
        Assert.Equal("Pass", merged.PulseResult);
        Assert.Equal("Pass", merged.OverallResult);
        Assert.Equal("NO", merged.BmsError);
    }

    [Fact]
    public void Separate_packs_are_not_merged_together()
    {
        var a = Rec("THA163301E58");
        var b = Rec("THA06330203C");
        b.SocResult = "Fail";

        var merged = ReportService.MergeByPack(new[] { a, b });

        Assert.Equal(2, merged.Count);
        Assert.Equal("THA06330203C", merged[0].BatteryPackId);   // ordered by pack id
        Assert.Equal("Fail", merged[0].SocResult);
        Assert.Equal("Pass", merged[1].SocResult);
    }

    /// <summary>
    /// A pack read from two files must merge the same way every time. Files are parsed in
    /// parallel into a ConcurrentBag, so the group's order is not reproducible; SoC and Voltage
    /// used to be taken with g.Last() and were effectively a coin flip between the two files.
    /// </summary>
    [Fact]
    public void SoC_does_not_depend_on_the_order_files_were_parsed_in()
    {
        var passing = Rec();
        passing.SourceFile = "a.csv";
        passing.Soc = 28.0;
        passing.SocResult = "Pass";

        var failing = Rec();
        failing.SourceFile = "b.csv";
        failing.Soc = 42.1;
        failing.SocResult = "Fail";

        var oneWay = Assert.Single(ReportService.MergeByPack(new[] { passing, failing }));
        var otherWay = Assert.Single(ReportService.MergeByPack(new[] { failing, passing }));

        Assert.Equal(oneWay.Soc, otherWay.Soc);
        // And the number printed has to be the one that justifies the verdict.
        Assert.Equal("Fail", oneWay.SocResult);
        Assert.Equal(42.1, oneWay.Soc);
    }

    [Fact]
    public void The_merged_record_names_every_file_the_pack_came_from()
    {
        var first = Rec();
        first.SourceFile = "b.csv";
        var second = Rec();
        second.SourceFile = "a.csv";

        var merged = Assert.Single(ReportService.MergeByPack(new[] { first, second }));

        Assert.Equal("a.csv, b.csv", merged.SourceFile);
    }
}
