using System.Text;
using Endurance.API.Configuration;
using Endurance.API.Services;
using Microsoft.Extensions.Options;
using Xunit;

namespace Endurance.API.Tests;

/// <summary>
/// A raw export is identified only by its filename, so the file -> pack mapping is the one
/// thing the Summary Report cannot get wrong. These pin the two ways it used to.
/// </summary>
public class PackIdMappingTests
{
    private static ReportCalculator Calc() => new(Options.Create(new ThresholdConfig()));

    /// <summary>
    /// The export that produced pack "TFAG2COM2PRO" on a signed Summary Report. The operator
    /// saved it with "Step_1" where the pack ID belongs, and the old fallback built an ID out
    /// of "TFA" plus the squashed filename - so a real pack's measurements were filed under a
    /// pack that does not exist.
    /// </summary>
    [Fact]
    public void A_filename_with_no_pack_id_yields_no_pack_id()
    {
        const string fileName =
            "G2_COM2__Profile_Test & Short_CDC_Test- Step_1_DESKTOP-2CDN5CI_20260620133511#002_1-Record Layer.csv";

        Assert.Equal(string.Empty, Calc().ExtractBatteryPackId(fileName));
    }

    [Fact]
    public void A_file_with_no_pack_id_is_rejected_rather_than_given_an_invented_one()
    {
        var path = Path.Combine(Path.GetTempPath(), $"cdc_{Guid.NewGuid():N}.csv");
        File.WriteAllText(path,
            "Step ID,Step State,Max_Voltage_0,Min_Voltage_0,Temperature_Cell_Max,Temperature_Cell_Min,SoC_User(%),Battery_Voltage_0(V),Battery_Current,No_Error\n" +
            "1,REST,3.300,3.297,25.0,24.8,28.0,52.8,0,0\n",
            new UTF8Encoding(false));

        var ex = Assert.Throws<InvalidOperationException>(
            () => Calc().ProcessRawCsv(path, "G2_COM2__Profile_Test- Step_1_DESKTOP.csv"));

        Assert.Contains("Battery Pack ID", ex.Message);
    }

    /// <summary>
    /// The ID has to stand alone between separators. An unanchored T[A-Z0-9]{11} starts at the
    /// first "T" it sees, so a longer alphanumeric token earlier in the name hands back twelve
    /// characters that are not a pack ID - here "TESTBENCH012" instead of "TFA3633001BA".
    /// </summary>
    [Fact]
    public void A_longer_token_earlier_in_the_name_is_not_mistaken_for_the_pack_id()
    {
        Assert.Equal("TFA3633001BA",
            Calc().ExtractBatteryPackId("TESTBENCH0123_TFA3633001BA.csv"));
    }

    [Theory]
    [InlineData("G14_COM14__Profile_Test & Short_CDC_Test- Step_TFA3633001BA_Profile_&_ShortCDC_DESKTOP-2CDN5CI_20260619193001#014_1-Record Layer.csv", "TFA3633001BA")]
    [InlineData("G10_COM10__NEW_HMCL 30 MIn Rest_THA563302082_DESKTOP-DSQD4I3_20260831073821#010_1-Record Layer.csv", "THA563302082")]
    [InlineData("25. G5_COM5__NEW_HMCL 30 MIn Rest_TGA963300A4D_DESKTOP-DSQD4I3_20260722162527#005_1-Record Layer.xlsx", "TGA963300A4D")]
    public void Real_plant_filenames_still_map_to_their_own_pack(string fileName, string expected)
    {
        Assert.Equal(expected, Calc().ExtractBatteryPackId(fileName));
    }
}
