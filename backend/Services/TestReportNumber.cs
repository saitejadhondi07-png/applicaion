using System;

namespace Endurance.API.Services
{
    /// <summary>
    /// Builds the plant's controlled Test Report ID, e.g. "ENE5160-BTR-PP-CDC01-24F2601".
    ///
    /// Format:  {Prefix}-{dd}{monthLetter}{yy}{nn}
    ///   dd          day of the report date, zero padded
    ///   monthLetter A = January .. L = December
    ///   yy          two-digit year
    ///   nn          sequence within that day, zero padded, starting at 01
    ///
    /// Verified against the signed plant reports:
    ///   25.05.2026, first of day -> ENE5160-BTR-PP-CDC01-25E2601
    ///   24.06.2026, first of day -> ENE5160-BTR-PP-CDC01-24F2601
    /// The template ships the unfilled placeholder "DDM2601" in this cell.
    /// </summary>
    public static class TestReportNumber
    {
        /// <summary>
        /// Product and test-type prefix. Change this alongside the model number if a
        /// different pack or test procedure is ever run on this line.
        /// </summary>
        public const string Prefix = "ENE5160-BTR-PP-CDC01";

        /// <param name="reportDate">
        /// The report date as printed on the document. Pass local time, not UTC - the
        /// report prints Report Date in local time, and the number must agree with it.
        /// </param>
        /// <param name="sequence">1-based position among the reports issued that day.</param>
        public static string Build(DateTime reportDate, int sequence)
        {
            if (sequence < 1) throw new ArgumentOutOfRangeException(nameof(sequence), "Sequence starts at 1.");

            char monthLetter = (char)('A' + reportDate.Month - 1);

            // Sequence is two digits by convention. A day busy enough to pass 99 reports
            // simply grows the field rather than wrapping and colliding.
            string seq = sequence.ToString("00");

            return $"{Prefix}-{reportDate:dd}{monthLetter}{reportDate:yy}{seq}";
        }

        /// <summary>
        /// The download filename stem the plant uses: document number, then the report date,
        /// e.g. "ENE5160-BTR-PP-CDC01-24F2601_24_Jun_2026".
        ///
        /// Formatted with InvariantCulture on purpose. Under the machine's own culture .NET
        /// renders September as "Sept" (ICU data for en-IN/en-GB), which produced
        /// "..._02_Sept_2026.xlsx" - four letters where every signed report uses three, and
        /// disagreeing with the frontend, which builds the same name from a fixed month list.
        /// </summary>
        /// <param name="documentNumber">The Test Report ID, or the internal id for legacy reports.</param>
        /// <param name="reportDate">Report date in local time.</param>
        public static string FileStem(string documentNumber, DateTime reportDate) =>
            $"{documentNumber}_{reportDate.ToString("dd_MMM_yyyy", System.Globalization.CultureInfo.InvariantCulture)}";
    }
}
