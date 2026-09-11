using Endurance.API.Services;
using Xunit;

namespace Endurance.API.Tests;

/// <summary>
/// The plant's controlled document number. The two expected values below are taken from
/// signed reports, not invented: they are the Test Report IDs printed on the 25 May and
/// 24 Jun 2026 reports, and they pin the day/month-letter/year/sequence layout.
/// </summary>
public class TestReportNumberTests
{
    [Fact]
    public void Matches_the_signed_report_from_25_May_2026()
    {
        Assert.Equal("ENE5160-BTR-PP-CDC01-25E2601",
            TestReportNumber.Build(new DateTime(2026, 5, 25), 1));
    }

    [Fact]
    public void Matches_the_signed_report_from_24_June_2026()
    {
        Assert.Equal("ENE5160-BTR-PP-CDC01-24F2601",
            TestReportNumber.Build(new DateTime(2026, 6, 24), 1));
    }

    [Theory]
    [InlineData(1, 'A')]
    [InlineData(5, 'E')]
    [InlineData(6, 'F')]
    [InlineData(9, 'I')]
    [InlineData(12, 'L')]
    public void Month_is_encoded_as_a_letter_A_through_L(int month, char expected)
    {
        var number = TestReportNumber.Build(new DateTime(2026, month, 7), 1);
        Assert.Equal($"ENE5160-BTR-PP-CDC01-07{expected}2601", number);
    }

    [Fact]
    public void Day_and_sequence_are_zero_padded()
    {
        Assert.Equal("ENE5160-BTR-PP-CDC01-01A2601",
            TestReportNumber.Build(new DateTime(2026, 1, 1), 1));
    }

    [Fact]
    public void Sequence_increments_within_the_same_day()
    {
        var day = new DateTime(2026, 9, 2);
        Assert.Equal("ENE5160-BTR-PP-CDC01-02I2601", TestReportNumber.Build(day, 1));
        Assert.Equal("ENE5160-BTR-PP-CDC01-02I2602", TestReportNumber.Build(day, 2));
        Assert.Equal("ENE5160-BTR-PP-CDC01-02I2610", TestReportNumber.Build(day, 10));
    }

    [Fact]
    public void A_busy_day_grows_the_field_rather_than_wrapping()
    {
        // 100+ reports in one day is not expected, but silently colliding would be worse
        // than a longer number on a document that must be unique.
        Assert.Equal("ENE5160-BTR-PP-CDC01-02I26100", TestReportNumber.Build(new DateTime(2026, 9, 2), 100));
    }

    [Fact]
    public void Year_uses_the_last_two_digits()
    {
        Assert.Equal("ENE5160-BTR-PP-CDC01-02I2701",
            TestReportNumber.Build(new DateTime(2027, 9, 2), 1));
    }

    [Fact]
    public void Sequence_below_one_is_rejected()
    {
        Assert.Throws<ArgumentOutOfRangeException>(
            () => TestReportNumber.Build(new DateTime(2026, 9, 2), 0));
    }

    [Fact]
    public void Never_emits_the_unfilled_template_placeholder()
    {
        var number = TestReportNumber.Build(new DateTime(2026, 9, 2), 1);
        Assert.DoesNotContain("DDM", number);
    }

    [Fact]
    public void File_stem_matches_the_signed_report_naming()
    {
        Assert.Equal("ENE5160-BTR-PP-CDC01-24F2601_24_Jun_2026",
            TestReportNumber.FileStem("ENE5160-BTR-PP-CDC01-24F2601", new DateTime(2026, 6, 24)));
    }

    [Fact]
    public void September_abbreviates_to_three_letters_not_Sept()
    {
        // Regression: under the machine culture (en-IN) .NET renders September as "Sept",
        // which shipped a real download named "..._02_Sept_2026.xlsx" - four letters, and
        // out of step with the frontend's fixed month list.
        var stem = TestReportNumber.FileStem("X", new DateTime(2026, 9, 2));
        Assert.Equal("X_02_Sep_2026", stem);
        Assert.DoesNotContain("Sept", stem);
    }

    [Theory]
    [InlineData(1, "Jan")]
    [InlineData(2, "Feb")]
    [InlineData(3, "Mar")]
    [InlineData(4, "Apr")]
    [InlineData(5, "May")]
    [InlineData(6, "Jun")]
    [InlineData(7, "Jul")]
    [InlineData(8, "Aug")]
    [InlineData(9, "Sep")]
    [InlineData(10, "Oct")]
    [InlineData(11, "Nov")]
    [InlineData(12, "Dec")]
    public void Every_month_abbreviates_to_exactly_three_letters(int month, string expected)
    {
        // Must stay identical to the MONTHS list in src/utils/downloadUtils.js, or the same
        // report downloads under two different names depending on which path served it.
        Assert.Equal($"X_15_{expected}_2026",
            TestReportNumber.FileStem("X", new DateTime(2026, month, 15)));
    }
}
